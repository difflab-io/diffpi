import { open, mkdir, readdir, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { plansDir } from '../store';
import { loadTemplate, renderTemplate } from '../templates';
import { appendPlanLog, type NewPlanLogEntry } from './log';
import { parsePlanDocument, renderPlanDocument } from './markdown';
import { assertStableId } from './ids';
import type { PlanDocument, PlanRecord, PlanStatus } from './types';
import { withPlanLock } from './lock';

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

export interface InitPlanInput {
  cwd: string;
  shortSlug: string;
  branch: string;
  title?: string;
  intent?: string;
  issueId?: string;
  issueUrl?: string;
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
  log(cwd: string, query: string, event: NewPlanLogEntry): ReturnType<typeof appendPlanLog>;
}

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
  return {
    context(cwd, query, filters) {
      return resolvePlan(cwd, query, filters, options);
    },
    async init(input) {
      const root = await plansDir(input.cwd, options.homeDir);
      const id = planRecordName(input.shortSlug, now());
      const dir = join(root, id);
      await assertContained(root, dirname(dir));
      try {
        await mkdir(dir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Plan ${id} already exists.`);
        throw error;
      }
      try {
        const timestamp = now().toISOString();
        const template = await loadTemplate('plan/PLAN', {
          homeDir: options.homeDir,
          bundledDir: options.bundledTemplatesDir,
        });
        const source = renderTemplate(template.content, {
          id,
          branch: input.branch,
          title: input.title?.trim() || titleFromSlug(input.shortSlug),
          intent: input.intent?.trim() || '<!-- Describe the intended outcome. -->',
          issue_id: input.issueId?.trim() || '<!-- Add issue tracker ID. -->',
          issue_url: input.issueUrl?.trim() || '<!-- Add issue tracker URL. -->',
          created_at: timestamp,
          updated_at: timestamp,
        });
        const document = parsePlanDocument(source, join(dir, 'PLAN.md'));
        await atomicWrite(join(dir, 'PLAN.md'), source);
        return {
          id,
          dir,
          planPath: join(dir, 'PLAN.md'),
          logPath: join(dir, 'logs.txt'),
          implementationDir: join(dir, 'implementation'),
          document,
          source,
        };
      } catch (error) {
        await rm(dir, { recursive: true, force: true });
        throw error;
      }
    },
    async read(cwd, query, filters) {
      const result = await resolvePlan(cwd, query, filters, options);
      if (!result.record) {
        if (result.ambiguous)
          throw new Error(
            `Plan query "${query}" is ambiguous: ${result.candidates.map((item) => item.id).join(', ')}.`,
          );
        throw new Error(`Plan "${query}" was not found.`);
      }
      return result.record;
    },
    async mutate(cwd, query, operation, update) {
      const initial = await this.read(cwd, query);
      return withPlanLock(
        initial.dir,
        async () => {
          const current = await readRecord(initial.dir);
          const next = await update(structuredClone(current.document));
          if (next.id !== current.id) throw new Error('A plan mutation cannot change the plan ID.');
          const document: PlanDocument = {
            ...next,
            revision: current.document.revision + 1,
            updatedAt: now().toISOString(),
          };
          const source = renderPlanDocument(document, current.source);
          parsePlanDocument(source, current.planPath);
          await atomicWrite(current.planPath, source);
          await ensureImplementationFiles(current.dir, document, options);
          return { ...current, document, source, implementationDir: join(current.dir, 'implementation') };
        },
        { operation },
      );
    },
    async log(cwd, query, event) {
      const record = await this.read(cwd, query);
      return withPlanLock(record.dir, () => appendPlanLog(record.logPath, event), { operation: 'append log' });
    },
  };
}

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

async function ensureImplementationFiles(
  dir: string,
  document: PlanDocument,
  options: PlanStoreOptions,
): Promise<void> {
  const implementationDir = join(dir, 'implementation');
  await mkdir(implementationDir, { recursive: true });
  const template = await loadTemplate('plan/implementation', {
    homeDir: options.homeDir,
    bundledDir: options.bundledTemplatesDir,
  });
  for (const phase of document.phases) {
    const path = join(implementationDir, `phase-${phase.id}.md`);
    try {
      await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const tasks =
        phase.tasks.map((task) => `- ${task.id}: ${task.title}`).join('\\n') || '- Add implementation tasks.';
      await atomicWrite(
        path,
        renderTemplate(template.content, {
          phase_id: phase.id,
          phase_title: phase.title,
          phase_objective: phase.objective,
          phase_tasks: tasks,
        }),
      );
    }
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const file = await open(temp, 'wx', 0o600);
  try {
    await file.writeFile(content, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temp, path);
  try {
    const directory = await open(dirname(path), 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    // Directory fsync is not supported on every platform.
  }
}

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
  assertStableId(slug, 'plan slug');
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
  return normalizeSlug(value)
    .replace(/^(?:[a-z]+-\d+-)/, '')
    .split('-')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}
