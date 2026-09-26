import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { atomicWrite, withDirectoryLock } from '../extensions/fsx';
import { zx } from '../extensions/zodx';
import { appendLogEntry, type DiffpiLogEntry, type NewLogEntry } from '../log';
import { plansDir } from '../store';
import { loadTemplate, renderTemplate } from '../templates';
import {
  parsePlanDocument,
  renderImplementationBrief,
  renderPlanDocument,
  validatePlanBriefs,
  validatePlanDocument,
} from './markdown';
import type {
  PlanAuthoringRequest,
  PlanDocument,
  PlanImplementationBrief,
  PlanLogEntry,
  PlanPhase,
  PlanRecord,
  PlanStatus,
  PlanTask,
} from './types';

// Types ----------------------------------------------------------------------

export type NewPlanLogEntry = NewLogEntry<PlanLogEntry & DiffpiLogEntry>;

export interface PlanStoreOptions {
  homeDir?: string;
  now?: () => Date;
  bundledTemplatesDir?: string;
}

export interface ResolvePlanFilters {
  branch?: string;
  statuses?: readonly PlanStatus[];
}

export interface PlanResolution {
  candidates: PlanRecord[];
  record?: PlanRecord;
  ambiguous: boolean;
}

export interface PlanTaskDraft {
  id: string;
  title: string;
  dependencies: string[];
}

export interface PlanPhaseDraft {
  id: string;
  title: string;
  objective: string;
  dependencies: string[];
  tasks: PlanTaskDraft[];
}

interface PlanRevisionContent {
  request: PlanAuthoringRequest;
  title: string;
  intent: string;
  requirements: string[];
  design: PlanDocument['design'];
  references: PlanDocument['references'];
  phases: PlanPhaseDraft[];
  briefs: PlanImplementationBrief[];
}

export interface CreatePlanRevisionRequest extends PlanRevisionContent {
  mode: 'create';
  shortSlug: string;
  branch: string;
  issueId?: string;
  issueUrl?: string;
}

export interface AmendPlanRevisionRequest extends PlanRevisionContent {
  mode: 'amend';
  plan: string;
  expectedPlanRevision: number;
}

export type PlanRevisionRequest = CreatePlanRevisionRequest | AmendPlanRevisionRequest;

export interface InitPlanInput {
  cwd: string;
  shortSlug: string;
  branch: string;
  title?: string;
  intent?: string;
  issueId?: string;
  issueUrl?: string;
  request?: PlanAuthoringRequest;
}

export interface PlanStore {
  context(cwd: string, query?: string, filters?: ResolvePlanFilters): Promise<PlanResolution>;
  init(input: InitPlanInput): Promise<PlanRecord>;
  read(cwd: string, query: string, filters?: ResolvePlanFilters): Promise<PlanRecord>;
  mutate(
    cwd: string,
    query: string,
    operation: string,
    update: (document: PlanDocument) => PlanDocument | Promise<PlanDocument>,
  ): Promise<PlanRecord>;
  applyRevision(cwd: string, request: PlanRevisionRequest): Promise<PlanRecord>;
  log(cwd: string, query: string, event: NewPlanLogEntry): Promise<PlanLogEntry>;
}

// API ------------------------------------------------------------------------

export function planRecordName(shortSlug: string, date = new Date()): string {
  const slug = normalizeSlug(shortSlug);
  return `${date.toISOString().slice(2, 10).replaceAll('-', '')}-${slug}`;
}

export async function resolvePlan(
  cwd: string,
  query?: string,
  filters: ResolvePlanFilters = {},
  options: PlanStoreOptions = {},
): Promise<PlanResolution> {
  const root = await plansDir(cwd, options.homeDir);
  const entries = await readdir(root, { withFileTypes: true });
  const normalizedQuery = query ? normalizeQuery(query) : undefined;
  const records: PlanRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.tmp' || entry.name === '.lock') continue;
    if (normalizedQuery && entry.name !== normalizedQuery && stripDate(entry.name) !== normalizedQuery) continue;
    const dir = join(root, entry.name);
    await assertContained(root, dir);
    try {
      const record = await readRecord(dir);
      if (filters.branch && record.document.branch !== filters.branch) continue;
      if (filters.statuses && !filters.statuses.includes(record.document.status)) continue;
      records.push(record);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  records.sort((left, right) => left.id.localeCompare(right.id));
  return { candidates: records, record: records.length === 1 ? records[0] : undefined, ambiguous: records.length > 1 };
}

export function createPlanStore(options: PlanStoreOptions = {}): PlanStore {
  const now = options.now ?? (() => new Date());
  const read = async (cwd: string, query: string, filters?: ResolvePlanFilters): Promise<PlanRecord> => {
    const result = await resolvePlan(cwd, query, filters, options);
    if (!result.record) {
      if (result.ambiguous)
        throw new Error(`Plan query "${query}" is ambiguous: ${result.candidates.map((item) => item.id).join(', ')}.`);
      throw new Error(`Plan "${query}" was not found.`);
    }
    return result.record;
  };
  return {
    context(cwd, query, filters) {
      return resolvePlan(cwd, query, filters, options);
    },
    async init(input) {
      const root = await plansDir(input.cwd, options.homeDir);
      const id = planRecordName(input.shortSlug, now());
      const dir = join(root, id);
      await createPlanDirectory(root, dir, id);
      try {
        const timestamp = now().toISOString();
        const template = await loadTemplate('plan/PLAN', {
          homeDir: options.homeDir,
          bundledDir: options.bundledTemplatesDir,
        });
        const title = input.title?.trim() || titleFromSlug(input.shortSlug);
        const source = renderTemplate(template.content, {
          id,
          branch: input.branch,
          title,
          intent: input.intent?.trim() || '<!-- Describe the intended outcome. -->',
          issue_id: input.issueId?.trim() || '',
          issue_url: input.issueUrl?.trim() || '',
          created_at: timestamp,
          updated_at: timestamp,
        });
        const document = parsePlanDocument(source, join(dir, 'PLAN.md'));
        const authoringRequest =
          input.request ??
          ({ kind: 'user', text: input.intent?.trim() || `Initialize phase-less plan ${title}.` } as const);
        await writeRevisionSnapshot(dir, document, source, authoringRequest, []);
        await writeLatestView(dir, document, source, []);
        return await readRecord(dir);
      } catch (error) {
        await rm(dir, { recursive: true, force: true });
        throw error;
      }
    },
    read,
    async applyRevision(cwd, request) {
      if (request.mode === 'create') {
        const root = await plansDir(cwd, options.homeDir);
        const id = planRecordName(request.shortSlug, now());
        const dir = join(root, id);
        await createPlanDirectory(root, dir, id);
        try {
          const timestamp = now().toISOString();
          const document = normalizeRevision(undefined, request, id, 0, timestamp);
          assertCompleteRevision(document, request.briefs);
          const source = renderPlanDocument(document);
          parsePlanDocument(source, join(dir, 'PLAN.md'));
          await writeRevisionSnapshot(dir, document, source, request.request, request.briefs);
          await writeLatestView(dir, document, source, request.briefs);
          return await readRecord(dir);
        } catch (error) {
          await rm(dir, { recursive: true, force: true });
          throw error;
        }
      }
      const initial = await read(cwd, request.plan);
      return withDirectoryLock(
        join(initial.dir, '.lock'),
        async () => {
          const current = await readRecord(initial.dir);
          if (current.document.revision !== request.expectedPlanRevision)
            throw new Error(
              `Expected plan revision ${request.expectedPlanRevision}, found ${current.document.revision}.`,
            );
          const revision = current.document.revision + 1;
          const document = normalizeRevision(current.document, request, current.id, revision, now().toISOString());
          assertCompleteRevision(document, request.briefs);
          const source = renderPlanDocument(document);
          parsePlanDocument(source, current.planPath);
          await writeRevisionSnapshot(current.dir, document, source, request.request, request.briefs);
          try {
            await writeLatestView(current.dir, document, source, request.briefs);
          } catch (error) {
            await rm(join(current.dir, 'revisions', String(revision)), { recursive: true, force: true });
            throw error;
          }
          return await readRecord(current.dir);
        },
        { operation: 'apply revision' },
      );
    },
    async mutate(cwd, query, operation, update) {
      const initial = await read(cwd, query);
      return withDirectoryLock(
        join(initial.dir, '.lock'),
        async () => {
          const current = await readRecord(initial.dir);
          const next = await update(structuredClone(current.document));
          if (next.id !== current.id) throw new Error('A plan mutation cannot change the plan ID.');
          const document: PlanDocument = {
            ...next,
            revision: current.document.revision,
            updatedAt: now().toISOString(),
          };
          const source = renderPlanDocument(document, current.source);
          parsePlanDocument(source, current.planPath);
          await atomicWrite(current.planPath, source);
          return { ...current, document, source };
        },
        { operation },
      );
    },
    async log(cwd, query, event) {
      const record = await read(cwd, query);
      return appendLogEntry<PlanLogEntry & DiffpiLogEntry>(record.logPath, event);
    },
  };
}

// Core -----------------------------------------------------------------------

async function readRecord(dir: string): Promise<PlanRecord> {
  const planPath = join(dir, 'PLAN.md');
  const logPath = join(dir, 'logs.txt');
  const source = await readFile(planPath, 'utf8');
  const document = parsePlanDocument(source, planPath);
  return {
    id: basename(dir),
    dir,
    planPath,
    logPath,
    implementationDir: join(dir, 'implementation'),
    document,
    source,
  };
}

async function createPlanDirectory(root: string, dir: string, id: string): Promise<void> {
  await assertContained(root, dirname(dir));
  try {
    await mkdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Plan ${id} already exists.`);
    throw error;
  }
}

async function writeRevisionSnapshot(
  planDir: string,
  document: PlanDocument,
  source: string,
  request: PlanAuthoringRequest,
  briefs: readonly PlanImplementationBrief[],
): Promise<void> {
  if (!request.text.trim()) throw new Error('An exact non-empty authoring request is required.');
  if (request.kind === 'annotation' && !request.response?.trim())
    throw new Error('Annotation requests require a non-empty response.');
  const revisionsDir = join(planDir, 'revisions');
  await mkdir(revisionsDir, { recursive: true });
  const target = join(revisionsDir, String(document.revision));
  try {
    await readFile(join(target, 'metadata.json'), 'utf8');
    throw new Error(`Revision ${document.revision} already exists and is immutable.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const staging = join(revisionsDir, `.tmp-${document.revision}-${randomUUID()}`);
  await mkdir(staging);
  try {
    const requestSource =
      request.kind === 'annotation'
        ? `## Original annotation\n${request.text}\n\n## LLM response\n${request.response}`
        : request.text;
    await atomicWrite(join(staging, 'request.md'), requestSource);
    await atomicWrite(
      join(staging, 'metadata.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          id: document.id,
          revision: document.revision,
          requestKind: request.kind,
          requestSha256: sha256(request.text),
          ...(request.kind === 'annotation'
            ? { originalAnnotationSha256: sha256(request.text), responseSha256: sha256(request.response) }
            : {}),
          createdAt: document.updatedAt,
        },
        null,
        2,
      )}\n`,
    );
    await atomicWrite(join(staging, 'PLAN.md'), source);
    await writeImplementationDirectory(staging, document, briefs);
    await rename(staging, target);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function writeLatestView(
  planDir: string,
  document: PlanDocument,
  source: string,
  briefs: readonly PlanImplementationBrief[],
): Promise<void> {
  const current = join(planDir, 'implementation');
  const stagingRoot = join(planDir, `.latest-${randomUUID()}`);
  const stagedImplementation = join(stagingRoot, 'implementation');
  const backup = join(planDir, `.implementation-backup-${randomUUID()}`);
  await mkdir(stagingRoot);
  await writeImplementationDirectory(stagingRoot, document, briefs);
  let backedUp = false;
  try {
    try {
      await rename(current, backup);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await rename(stagedImplementation, current);
    await atomicWrite(join(planDir, 'PLAN.md'), source);
    if (backedUp) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(current, { recursive: true, force: true });
    if (backedUp) await rename(backup, current);
    throw error;
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

async function writeImplementationDirectory(
  baseDir: string,
  document: PlanDocument,
  briefs: readonly PlanImplementationBrief[],
): Promise<void> {
  const implementationDir = join(baseDir, 'implementation');
  await mkdir(implementationDir, { recursive: true });
  for (const [index, phase] of document.phases.entries()) {
    const brief = briefs[index];
    if (!brief) throw new Error(`Missing implementation brief for phase ${phase.id}.`);
    await atomicWrite(
      join(implementationDir, `phase-${index + 1}.md`),
      renderImplementationBrief(document.revision, index + 1, phase, brief),
    );
  }
}

function normalizeRevision(
  current: PlanDocument | undefined,
  request: PlanRevisionRequest,
  id: string,
  revision: number,
  updatedAt: string,
): PlanDocument {
  if (current?.status === 'completed') throw new Error('Completed plans cannot be amended.');
  if (current?.execution?.active && request.request.kind !== 'blocker')
    throw new Error('An active execution accepts only a blocker amendment.');
  const currentPhases = new Map(current?.phases.map((phase) => [phase.id, phase]) ?? []);
  for (const phase of current?.phases ?? []) {
    if (
      !request.phases.some((candidate) => candidate.id === phase.id) &&
      (phase.status === 'completed' || phase.status === 'in_progress')
    )
      throw new Error(`${phase.status === 'completed' ? 'Completed' : 'Active'} phase ${phase.id} cannot be removed.`);
  }
  const phases = request.phases.map((draft) => reconcilePhase(currentPhases.get(draft.id), draft, current));
  const createdAt = current?.createdAt ?? updatedAt;
  return {
    schemaVersion: 1,
    id,
    revision,
    title: request.title,
    branch: current?.branch ?? (request.mode === 'create' ? request.branch : ''),
    issueId: current?.issueId ?? (request.mode === 'create' ? request.issueId : undefined),
    issueUrl: current?.issueUrl ?? (request.mode === 'create' ? request.issueUrl : undefined),
    intent: request.intent,
    requirements: request.requirements,
    design: request.design,
    references: request.references,
    phases,
    status: nextPlanStatus(current),
    execution: current?.execution,
    createdAt,
    updatedAt,
  };
}

function reconcilePhase(
  current: PlanPhase | undefined,
  draft: PlanPhaseDraft,
  plan: PlanDocument | undefined,
): PlanPhase {
  if (!current)
    return {
      ...draft,
      revision: 0,
      status: 'pending',
      gate: { phaseRevision: 0, status: 'pending', results: [] },
      tasks: draft.tasks.map(newTask),
    };
  if (current.status === 'completed') {
    if (JSON.stringify(phaseContent(current)) !== JSON.stringify(draft))
      throw new Error(`Completed phase ${current.id} cannot be changed.`);
    return current;
  }
  const byId = new Map(current.tasks.map((task) => [task.id, task]));
  for (const task of current.tasks) {
    if (
      !draft.tasks.some((candidate) => candidate.id === task.id) &&
      (task.status === 'completed' || task.status === 'in_progress')
    )
      throw new Error(`${task.status === 'completed' ? 'Completed' : 'Active'} task ${task.id} cannot be removed.`);
  }
  const tasks = draft.tasks.map((task) => reconcileTask(byId.get(task.id), task));
  const changed = JSON.stringify(phaseContent(current)) !== JSON.stringify(draft);
  const revision = changed ? current.revision + 1 : current.revision;
  const wasBlocked = current.status === 'blocked';
  return {
    ...current,
    ...draft,
    revision,
    tasks,
    status: wasBlocked ? (plan?.execution?.active ? 'in_progress' : 'pending') : current.status,
    gate: changed || wasBlocked ? { phaseRevision: revision, status: 'stale', results: [] } : current.gate,
    blocker: wasBlocked ? undefined : current.blocker,
  };
}

function reconcileTask(current: PlanTask | undefined, draft: PlanTaskDraft): PlanTask {
  if (!current) return newTask(draft);
  const changed = JSON.stringify(taskContent(current)) !== JSON.stringify(draft);
  if ((current.status === 'completed' || current.status === 'in_progress') && changed)
    throw new Error(`${current.status === 'completed' ? 'Completed' : 'Active'} task ${current.id} cannot be changed.`);
  if (current.status === 'completed' || current.status === 'in_progress') return current;
  return {
    ...current,
    ...draft,
    revision: changed ? current.revision + 1 : current.revision,
    status: current.status === 'blocked' ? 'pending' : current.status,
    owner: current.status === 'blocked' ? undefined : current.owner,
    executionId: current.status === 'blocked' ? undefined : current.executionId,
    blocker: current.status === 'blocked' ? undefined : current.blocker,
  };
}

function newTask(draft: PlanTaskDraft): PlanTask {
  return { ...draft, revision: 0, status: 'pending' };
}

function phaseContent(phase: PlanPhase): PlanPhaseDraft {
  return {
    id: phase.id,
    title: phase.title,
    objective: phase.objective,
    dependencies: phase.dependencies,
    tasks: phase.tasks.map(taskContent),
  };
}

function taskContent(task: PlanTask): PlanTaskDraft {
  return { id: task.id, title: task.title, dependencies: task.dependencies };
}

function nextPlanStatus(current: PlanDocument | undefined): PlanStatus {
  if (!current) return 'draft';
  if (current.execution?.active) return current.status === 'blocked' ? 'in_progress' : current.status;
  return current.status === 'ready' || current.status === 'blocked' ? 'draft' : current.status;
}

function assertCompleteRevision(document: PlanDocument, briefs: readonly PlanImplementationBrief[]): void {
  const errors = [...validatePlanDocument(document, { strict: true }), ...validatePlanBriefs(document, briefs)].filter(
    (issue) => issue.severity === 'error',
  );
  if (errors.length) throw new Error(`Invalid plan revision: ${errors.map((issue) => issue.message).join(' ')}`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Utils ----------------------------------------------------------------------

async function assertContained(root: string, candidate: string): Promise<void> {
  const canonicalRoot = await realpath(root);
  let canonicalCandidate: string;
  try {
    canonicalCandidate = await realpath(candidate);
  } catch {
    canonicalCandidate = resolve(candidate);
  }
  if (canonicalCandidate !== canonicalRoot && !canonicalCandidate.startsWith(`${canonicalRoot}${sep}`)) {
    throw new Error(`Plan path escapes the shared store: ${candidate}.`);
  }
}

function normalizeSlug(value: string): string {
  if (!value || value.includes('\0') || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error(`Invalid plan slug: ${value}.`);
  }
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!zx.id.safeParse(slug).success) throw new Error(`Invalid plan slug: ${value}.`);
  return slug;
}

function normalizeQuery(value: string): string {
  if (!value || value.includes('\0') || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error(`Invalid plan query: ${value}.`);
  }
  return value.toLowerCase();
}

function stripDate(value: string): string {
  return value.replace(/^\d{6}-/, '');
}

function titleFromSlug(value: string): string {
  const slug = normalizeSlug(value).replace(/^(?:[a-z]+-\d+-)/, '');
  return slug.replace(/(^|-)([a-z])/g, (_match, separator: string, letter: string) => {
    return `${separator ? ' ' : ''}${letter.toUpperCase()}`;
  });
}
