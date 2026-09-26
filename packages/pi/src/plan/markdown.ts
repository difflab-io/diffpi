import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { html, heading, list as mdList, listItem, paragraph, root, strong, text } from 'mdast-builder';
import remarkStringify from 'remark-stringify';
import { unified as createMarkdownProcessor } from 'unified';
import { zx } from '../extensions/zodx';
import type {
  PlanDocument,
  PlanImplementationBrief,
  PlanPhase,
  PlanRecord,
  PlanReference,
  PlanTask,
  PlanValidationIssue,
  PlanValidationOptions,
} from './types';

// Types ----------------------------------------------------------------------

const PLAN_MARKER = /<!-- diffpi-plan: (\{[^\n]+\}) -->/;
const PHASE_MARKER = /<!-- diffpi-phase: (\{[^\n]+\}) -->/g;
const TASK_MARKER = /<!-- diffpi-task: (\{[^\n]+\}) -->/g;
const BRIEF_MARKER = /<!-- diffpi-implementation: (\{[^\n]+\}) -->/;
const BRIEF_TASK_MARKER = /<!-- diffpi-brief-task: (\{[^\n]+\}) -->/g;
const SUPPORTED_SCHEMA = 1;

type PlanMarker = Pick<
  PlanDocument,
  | 'schemaVersion'
  | 'id'
  | 'revision'
  | 'branch'
  | 'issueId'
  | 'issueUrl'
  | 'status'
  | 'execution'
  | 'createdAt'
  | 'updatedAt'
>;
type PhaseMarker = Pick<PlanPhase, 'id' | 'revision' | 'status' | 'gate' | 'commit' | 'blocker'>;
type TaskMarker = Pick<PlanTask, 'id' | 'revision' | 'status' | 'owner' | 'executionId' | 'blocker'>;
interface BriefMarker {
  schemaVersion: 1;
  planRevision: number;
  ordinal: number;
  phaseId: string;
}
interface BriefTaskMarker {
  id: string;
}
interface RevisionMetadata {
  schemaVersion: 1;
  id: string;
  revision: number;
  requestKind: string;
  requestSha256: string;
  createdAt: string;
}

// API ------------------------------------------------------------------------

export function countDesignWords(plan: PlanDocument): number {
  return [plan.design.bigIdeas, plan.design.keyApiUpdates, plan.design.consequences]
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function validatePlanDocument(plan: PlanDocument, options: PlanValidationOptions = {}): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const add = (code: string, severity: 'error' | 'warning', message: string, path?: string) =>
    issues.push({ code, severity, message, path });
  try {
    assertStableId(plan.id, 'plan id');
    assertUniqueIds(
      plan.phases.map((phase) => phase.id),
      'phase id',
    );
    assertUniqueIds(
      plan.phases.flatMap((phase) => phase.tasks.map((task) => task.id)),
      'task id',
    );
  } catch (error) {
    add('invalid-id', 'error', (error as Error).message);
  }
  if (plan.schemaVersion !== SUPPORTED_SCHEMA)
    add('schema', 'error', `Unsupported plan schema: ${plan.schemaVersion}.`);
  const phaseIds = new Set(plan.phases.map((phase) => phase.id));
  const taskIds = new Set(plan.phases.flatMap((phase) => phase.tasks.map((task) => task.id)));
  for (const phase of plan.phases) {
    for (const dependency of phase.dependencies) {
      if (!phaseIds.has(dependency))
        add('dangling-dependency', 'error', `Phase ${phase.id} depends on missing ${dependency}.`);
    }
    for (const task of phase.tasks) {
      for (const dependency of task.dependencies) {
        if (!taskIds.has(dependency))
          add('dangling-dependency', 'error', `Task ${task.id} depends on missing ${dependency}.`);
      }
      if (options.strict && isPlaceholder(task.title))
        add('placeholder', 'error', `Task ${task.id} has placeholder content.`, task.id);
    }
    if (options.strict && phase.tasks.length === 0)
      add('empty-phase', 'error', `Phase ${phase.id} has no tasks.`, phase.id);
    if (options.strict && (isPlaceholder(phase.title) || isPlaceholder(phase.objective)))
      add('placeholder', 'error', `Phase ${phase.id} has placeholder content.`, phase.id);
  }
  for (const cycle of dependencyCycles(plan))
    add('dependency-cycle', 'error', `Dependency cycle: ${cycle.join(' -> ')}.`);
  const designWords = countDesignWords(plan);
  if (designWords > 300) add('design-length', 'warning', `Design is ${designWords} words; prefer 300 or fewer.`);
  if (options.strict && designWords > 800)
    add('design-too-long', 'error', `Design is ${designWords} words; finalization allows at most 800.`);
  if (options.strict) {
    if (plan.phases.length === 0) add('no-phases', 'error', 'Finalization requires at least one phase.');
    if (isPlaceholder(plan.intent)) add('placeholder', 'error', 'Intent must contain concrete content.', 'intent');
    if (!plan.requirements.length || plan.requirements.some(isPlaceholder))
      add('requirements', 'error', 'Requirements must contain concrete content.', 'requirements');
    for (const [key, value] of Object.entries(plan.design)) {
      if (isPlaceholder(value)) add('design', 'error', `Design/${key} must contain concrete content.`, `design.${key}`);
    }
  }
  return issues;
}

export function validatePlanBriefs(
  plan: PlanDocument,
  briefs: readonly PlanImplementationBrief[],
): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const phaseIds = plan.phases.map((phase) => phase.id);
  const briefIds = briefs.map((brief) => brief.phaseId);
  if (!sameIds(phaseIds, briefIds))
    issues.push({
      code: 'brief-phase-ids',
      severity: 'error',
      message: `Brief phase IDs must exactly match plan phases in order: ${phaseIds.join(', ')}.`,
    });
  for (const [index, phase] of plan.phases.entries()) {
    const brief = briefs[index];
    if (!brief || brief.phaseId !== phase.id) continue;
    if (isPlaceholder(brief.summary))
      issues.push({ code: 'brief-placeholder', severity: 'error', message: `Brief ${phase.id} needs a summary.` });
    const taskIds = phase.tasks.map((task) => task.id);
    const briefTaskIds = brief.tasks.map((task) => task.taskId);
    if (!sameIds(taskIds, briefTaskIds))
      issues.push({
        code: 'brief-task-ids',
        severity: 'error',
        message: `Brief ${phase.id} task IDs must exactly match phase tasks in order: ${taskIds.join(', ')}.`,
      });
    for (const task of brief.tasks) {
      for (const [field, values] of [
        ['ordered steps', task.steps],
        ['file scopes', task.fileScopes],
        ['acceptance criteria', task.acceptanceCriteria],
      ] as const) {
        if (!values.length || values.some(isPlaceholder))
          issues.push({
            code: 'brief-incomplete',
            severity: 'error',
            message: `Brief task ${task.taskId} needs concrete ${field}.`,
            path: task.taskId,
          });
      }
    }
    for (const [field, values] of [
      ['API changes', brief.apiChanges],
      ['libraries', brief.libraries],
      ['constraints', brief.constraints],
    ] as const) {
      if (values.some(isPlaceholder))
        issues.push({
          code: 'brief-placeholder',
          severity: 'error',
          message: `Brief ${phase.id} has placeholder ${field}.`,
          path: phase.id,
        });
    }
  }
  return issues;
}

export async function validatePlanRecord(
  record: PlanRecord,
  options: PlanValidationOptions = {},
): Promise<PlanValidationIssue[]> {
  const issues = validatePlanDocument(record.document, options);
  if (!options.strict) return issues;
  await validateImplementationDirectory(record.dir, record.document, issues, 'latest');
  if (options.checkSnapshots !== false) await validateRevisionSnapshots(record, issues);
  return issues;
}

export function renderImplementationBrief(
  planRevision: number,
  ordinal: number,
  phase: PlanPhase,
  brief: PlanImplementationBrief,
): string {
  const marker: BriefMarker = { schemaVersion: 1, planRevision, ordinal, phaseId: phase.id };
  const tasks = phase.tasks
    .map((task, index) => {
      const details = brief.tasks[index];
      if (!details || details.taskId !== task.id) throw new Error(`Missing implementation details for ${task.id}.`);
      return `<!-- diffpi-brief-task: ${json({ id: task.id } satisfies BriefTaskMarker)} -->
### Task: ${task.title}

#### Ordered Steps

${bulletList(details.steps)}

#### File Scopes

${bulletList(details.fileScopes)}

#### Acceptance Criteria

${bulletList(details.acceptanceCriteria)}

<!-- /diffpi-brief-task -->`;
    })
    .join('\n\n');
  return `<!-- diffpi-implementation: ${json(marker)} -->
# Phase ${ordinal}: ${phase.title}

- **Phase ID:** ${phase.id}
- **Plan Revision:** ${planRevision}

## Summary

${brief.summary}

## Objective

${phase.objective}

## Tasks

${tasks}

## API Changes

${bulletList(brief.apiChanges, 'None.')}

## Libraries and Algorithms

${bulletList(brief.libraries, 'None.')}

## Implementation Constraints

${bulletList(brief.constraints, 'None.')}
`;
}

export function renderPlanDocument(plan: PlanDocument, previousSource?: string): string {
  if (previousSource && canPatch(previousSource, plan)) return patchMarkers(previousSource, plan);
  const marker: PlanMarker = {
    schemaVersion: plan.schemaVersion,
    id: plan.id,
    revision: plan.revision,
    branch: plan.branch,
    issueId: plan.issueId,
    issueUrl: plan.issueUrl,
    status: plan.status,
    execution: plan.execution,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
  const metadata = mdList(
    'unordered',
    [
      ['Plan ID', plan.id],
      ['Branch', plan.branch],
      ...(plan.issueId ? ([['Issue', plan.issueId]] as const) : []),
      ...(plan.issueUrl ? ([['Issue URL', plan.issueUrl]] as const) : []),
      ['Status', plan.status],
      ['Revision', String(plan.revision)],
    ].map(([label, value]) => listItem(paragraph([strong(text(`${label}:`)), text(` ${value}`)]))),
  );
  const requirements = plan.requirements.length
    ? mdList(
        'unordered',
        plan.requirements.map((item) => listItem(paragraph(html(item)))),
      )
    : html('<!-- Add requirements. -->');
  const references = plan.references.length
    ? mdList(
        'unordered',
        plan.references.map((reference) =>
          listItem(paragraph(html(`<!-- diffpi-reference: ${json(reference)} --> ${reference.value}`))),
        ),
      )
    : html('<!-- Add references. -->');
  const tree = root([
    html(`<!-- diffpi-plan: ${json(marker)} -->`),
    heading(1, text(plan.title)),
    metadata,
    heading(2, text('Intent')),
    html(plan.intent || '<!-- Describe the intended outcome. -->'),
    heading(2, text('Requirements')),
    requirements,
    heading(2, text('Design')),
    heading(3, text('Big Ideas')),
    html(plan.design.bigIdeas || '<!-- Describe the main approach. -->'),
    heading(3, text('Key API Addition/Updates')),
    html(plan.design.keyApiUpdates || '<!-- Describe public API changes. -->'),
    heading(3, text('Consequences')),
    html(plan.design.consequences || '<!-- Describe trade-offs and limitations. -->'),
    heading(2, text('Implementation')),
    ...(plan.phases.length
      ? plan.phases.flatMap((phase) => [html(renderPhase(phase))])
      : [html('<!-- Add phases with plan_apply_revision. -->')]),
    heading(2, text('References')),
    references,
  ]);
  return createMarkdownProcessor()
    .use(remarkStringify, { bullet: '-', fence: '`', fences: true, incrementListMarker: false })
    .stringify(tree as never);
}

export function parsePlanDocument(source: string, ref = 'PLAN.md'): PlanDocument {
  const planMatch = source.match(PLAN_MARKER);
  if (!planMatch) throw new Error(`${ref}: missing or malformed diffpi-plan marker.`);
  if ((source.match(new RegExp(PLAN_MARKER.source, 'g')) ?? []).length !== 1)
    throw new Error(`${ref}: duplicate diffpi-plan marker.`);
  const marker = parseMarker<PlanMarker>(planMatch[1]!, `${ref} plan`);
  if (marker.schemaVersion !== SUPPORTED_SCHEMA)
    throw new Error(`${ref}: unsupported plan schema ${String(marker.schemaVersion)}.`);
  assertStableId(marker.id, 'plan id');
  const title = source.match(/^# (.+)$/m)?.[1]?.trim();
  if (!title) throw new Error(`${ref}: missing plan title.`);
  const phases = parsePhases(section(source, 'Implementation'), ref);
  const document: PlanDocument = {
    ...marker,
    schemaVersion: 1,
    title,
    intent: cleanPlaceholder(section(source, 'Intent')),
    requirements: parseBullets(section(source, 'Requirements')),
    design: {
      bigIdeas: cleanPlaceholder(subsection(source, 'Design', 'Big Ideas')),
      keyApiUpdates: cleanPlaceholder(subsection(source, 'Design', 'Key API Addition/Updates')),
      consequences: cleanPlaceholder(subsection(source, 'Design', 'Consequences')),
    },
    phases,
    references: parseReferences(section(source, 'References')),
  };
  const errors = validatePlanDocument(document).filter((issue) => issue.severity === 'error');
  if (errors.length) throw new Error(`${ref}: ${errors.map((issue) => issue.message).join(' ')}`);
  return document;
}

// Core -----------------------------------------------------------------------

function renderPhase(phase: PlanPhase): string {
  const marker: PhaseMarker = {
    id: phase.id,
    revision: phase.revision,
    status: phase.status,
    gate: phase.gate,
    commit: phase.commit,
    blocker: phase.blocker,
  };
  const dependencies = phase.dependencies.length ? phase.dependencies.join(', ') : 'none';
  return `<!-- diffpi-phase: ${json(marker)} -->
### Phase: ${phase.title}

**Objective:** ${phase.objective}

**Dependencies:** ${dependencies}

${phase.tasks.map(renderTask).join('\n\n')}

<!-- /diffpi-phase -->`;
}

function renderTask(task: PlanTask): string {
  const marker: TaskMarker = {
    id: task.id,
    revision: task.revision,
    status: task.status,
    owner: task.owner,
    executionId: task.executionId,
    blocker: task.blocker,
  };
  const checked = task.status === 'completed' || task.status === 'skipped' ? 'x' : ' ';
  return `<!-- diffpi-task: ${json(marker)} -->
- [${checked}] **${task.title}**
  - Dependencies: ${list(task.dependencies)}
<!-- /diffpi-task -->`;
}

function parsePhases(input: string, ref: string): PlanPhase[] {
  const starts = [...input.matchAll(PHASE_MARKER)];
  const phases = starts.map((match, index) => {
    const start = match.index!;
    const end = input.indexOf('<!-- /diffpi-phase -->', start);
    if (end < 0) throw new Error(`${ref}: phase marker has no closing marker.`);
    const next = starts[index + 1]?.index;
    if (next !== undefined && next < end) throw new Error(`${ref}: nested or unclosed phase marker.`);
    const body = input.slice(start + match[0].length, end);
    const marker = parseMarker<PhaseMarker>(match[1]!, `${ref} phase`);
    assertStableId(marker.id, 'phase id');
    const title = body.match(/^### Phase: (.+)$/m)?.[1]?.trim();
    const objective = body.match(/^\*\*Objective:\*\*\s*(.*)$/m)?.[1]?.trim();
    if (!title || !objective) throw new Error(`${ref}: phase ${marker.id} is missing title or objective.`);
    return {
      ...marker,
      title,
      objective,
      dependencies: parseCsv(body.match(/^\*\*Dependencies:\*\*\s*(.*)$/m)?.[1]),
      tasks: parseTasks(body, ref),
    };
  });
  assertUniqueIds(
    phases.map((phase) => phase.id),
    'phase id',
  );
  return phases;
}

function parseTasks(input: string, ref: string): PlanTask[] {
  const starts = [...input.matchAll(TASK_MARKER)];
  const tasks = starts.map((match, index) => {
    const start = match.index!;
    const end = input.indexOf('<!-- /diffpi-task -->', start);
    if (end < 0) throw new Error(`${ref}: task marker has no closing marker.`);
    const next = starts[index + 1]?.index;
    if (next !== undefined && next < end) throw new Error(`${ref}: nested or unclosed task marker.`);
    const body = input.slice(start + match[0].length, end);
    const marker = parseMarker<TaskMarker>(match[1]!, `${ref} task`);
    assertStableId(marker.id, 'task id');
    const title = body.match(/^- \[[ xX]\] \*\*(.+)\*\*$/m)?.[1]?.trim();
    if (!title) throw new Error(`${ref}: task ${marker.id} is missing its checkbox title.`);
    return {
      ...marker,
      title,
      dependencies: parseListValue(body, 'Dependencies'),
    };
  });
  assertUniqueIds(
    tasks.map((task) => task.id),
    'task id',
  );
  return tasks;
}

function parseReferences(input: string): PlanReference[] {
  return [...input.matchAll(/^- <!-- diffpi-reference: (\{[^\n]+\}) -->\s*(.*)$/gm)].map((match) => {
    const marker = parseMarker<PlanReference>(match[1]!, 'reference');
    assertStableId(marker.id, 'reference id');
    return { id: marker.id, value: match[2]!.trim() || marker.value };
  });
}

function canPatch(source: string, next: PlanDocument): boolean {
  try {
    const old = parsePlanDocument(source);
    return JSON.stringify(contentShape(old)) === JSON.stringify(contentShape(next));
  } catch {
    return false;
  }
}

function patchMarkers(source: string, plan: PlanDocument): string {
  const planMarker: PlanMarker = {
    schemaVersion: plan.schemaVersion,
    id: plan.id,
    revision: plan.revision,
    branch: plan.branch,
    issueId: plan.issueId,
    issueUrl: plan.issueUrl,
    status: plan.status,
    execution: plan.execution,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
  let output = source.replace(PLAN_MARKER, `<!-- diffpi-plan: ${json(planMarker)} -->`);
  output = output.replace(/^- \*\*Status:\*\* .*$/m, `- **Status:** ${plan.status}`);
  output = output.replace(/^- \*\*Revision:\*\* .*$/m, `- **Revision:** ${plan.revision}`);
  for (const phase of plan.phases) {
    const marker: PhaseMarker = {
      id: phase.id,
      revision: phase.revision,
      status: phase.status,
      gate: phase.gate,
      commit: phase.commit,
      blocker: phase.blocker,
    };
    output = replaceMarkerById(output, 'phase', phase.id, marker);
    for (const task of phase.tasks) {
      const taskMarker: TaskMarker = {
        id: task.id,
        revision: task.revision,
        status: task.status,
        owner: task.owner,
        executionId: task.executionId,
        blocker: task.blocker,
      };
      output = replaceMarkerById(output, 'task', task.id, taskMarker);
      const checked = task.status === 'completed' || task.status === 'skipped' ? 'x' : ' ';
      const escaped = escapeRegExp(task.title);
      output = output.replace(
        new RegExp(`^- \\[[ xX]\\] \\*\\*${escaped}\\*\\*$`, 'm'),
        `- [${checked}] **${task.title}**`,
      );
    }
  }
  return output;
}

function replaceMarkerById(source: string, kind: 'phase' | 'task', id: string, marker: unknown): string {
  const pattern = new RegExp(`<!-- diffpi-${kind}: \\{[^\\n]*"id":"${escapeRegExp(id)}"[^\\n]*\\} -->`);
  if (!pattern.test(source)) throw new Error(`Cannot update missing ${kind} marker ${id}.`);
  return source.replace(pattern, `<!-- diffpi-${kind}: ${json(marker)} -->`);
}

function contentShape(plan: PlanDocument): Record<string, unknown> {
  return {
    title: plan.title,
    branch: plan.branch,
    intent: plan.intent,
    requirements: plan.requirements,
    design: plan.design,
    references: plan.references,
    phases: plan.phases.map((phase) => ({
      id: phase.id,
      title: phase.title,
      objective: phase.objective,
      dependencies: phase.dependencies,
      tasks: phase.tasks.map(({ id, title, dependencies }) => ({ id, title, dependencies })),
    })),
  };
}

function dependencyCycles(plan: PlanDocument): string[][] {
  const graph = new Map<string, string[]>();
  for (const phase of plan.phases) graph.set(phase.id, phase.dependencies);
  for (const task of plan.phases.flatMap((phase) => phase.tasks)) graph.set(task.id, task.dependencies);
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) walk(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) walk(id, []);
  return cycles;
}

async function validateRevisionSnapshots(record: PlanRecord, issues: PlanValidationIssue[]): Promise<void> {
  const revisionsDir = join(record.dir, 'revisions');
  let entries: string[];
  try {
    entries = await readdir(revisionsDir);
  } catch {
    issues.push({ code: 'snapshot-missing', severity: 'error', message: 'Missing revisions directory.' });
    return;
  }
  const expected = Array.from({ length: record.document.revision + 1 }, (_, index) => String(index));
  if (
    !sameIds(
      expected,
      entries.filter((entry) => /^\d+$/.test(entry)).sort((a, b) => Number(a) - Number(b)),
    )
  )
    issues.push({
      code: 'snapshot-sequence',
      severity: 'error',
      message: `Revision snapshots must be exactly ${expected.join(', ')}.`,
      path: revisionsDir,
    });
  for (const entry of entries) {
    if (!/^\d+$/.test(entry))
      issues.push({ code: 'snapshot-entry', severity: 'error', message: `Unexpected revisions entry: ${entry}.` });
  }
  for (const revision of expected) {
    const dir = join(revisionsDir, revision);
    try {
      const [request, metadataSource, planSource] = await Promise.all([
        readFile(join(dir, 'request.md'), 'utf8'),
        readFile(join(dir, 'metadata.json'), 'utf8'),
        readFile(join(dir, 'PLAN.md'), 'utf8'),
      ]);
      if (isPlaceholder(request))
        issues.push({ code: 'snapshot-request', severity: 'error', message: `Revision ${revision} request is empty.` });
      const metadata = JSON.parse(metadataSource) as RevisionMetadata;
      if (
        metadata.schemaVersion !== 1 ||
        metadata.id !== record.id ||
        metadata.revision !== Number(revision) ||
        !['user', 'annotation', 'blocker'].includes(metadata.requestKind) ||
        metadata.requestSha256 !== sha256(request)
      )
        issues.push({
          code: 'snapshot-metadata',
          severity: 'error',
          message: `Revision ${revision} metadata does not match its immutable request.`,
        });
      const snapshotPlan = parsePlanDocument(planSource, join(dir, 'PLAN.md'));
      if (snapshotPlan.id !== record.id || snapshotPlan.revision !== Number(revision))
        issues.push({
          code: 'snapshot-plan',
          severity: 'error',
          message: `Revision ${revision} PLAN.md has mismatched identity or revision.`,
        });
      await validateImplementationDirectory(dir, snapshotPlan, issues, `revision ${revision}`);
    } catch (error) {
      issues.push({
        code: 'snapshot-missing',
        severity: 'error',
        message: `Revision ${revision} is incomplete: ${(error as Error).message}`,
        path: dir,
      });
    }
  }
}

async function validateImplementationDirectory(
  baseDir: string,
  plan: PlanDocument,
  issues: PlanValidationIssue[],
  label: string,
): Promise<void> {
  const dir = join(baseDir, 'implementation');
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    issues.push({
      code: 'brief-directory',
      severity: 'error',
      message: `${label} is missing implementation/.`,
      path: dir,
    });
    return;
  }
  const expected = plan.phases.map((_phase, index) => `phase-${index + 1}.md`);
  const actual = entries.filter((entry) => entry.endsWith('.md')).sort((left, right) => left.localeCompare(right));
  if (
    !sameIds(
      [...expected].sort((left, right) => left.localeCompare(right)),
      actual,
    )
  )
    issues.push({
      code: 'brief-filenames',
      severity: 'error',
      message: `${label} briefs must use exactly: ${expected.join(', ') || '(none)'}.`,
      path: dir,
    });
  for (const [index, phase] of plan.phases.entries()) {
    const path = join(dir, `phase-${index + 1}.md`);
    try {
      validateBriefSource(await readFile(path, 'utf8'), plan.revision, index + 1, phase, path, issues);
    } catch (error) {
      issues.push({
        code: 'brief-missing',
        severity: 'error',
        message: `${label} brief phase-${index + 1}.md is missing: ${(error as Error).message}`,
        path,
      });
    }
  }
}

function validateBriefSource(
  source: string,
  planRevision: number,
  ordinal: number,
  phase: PlanPhase,
  path: string,
  issues: PlanValidationIssue[],
): void {
  const matches = source.match(new RegExp(BRIEF_MARKER.source, 'g')) ?? [];
  const markerMatch = source.match(BRIEF_MARKER);
  if (matches.length !== 1 || !markerMatch) {
    issues.push({ code: 'brief-marker', severity: 'error', message: `${path} needs one implementation marker.`, path });
    return;
  }
  const marker = parseMarker<BriefMarker>(markerMatch[1]!, `${path} implementation`);
  if (
    marker.schemaVersion !== 1 ||
    marker.planRevision !== planRevision ||
    marker.ordinal !== ordinal ||
    marker.phaseId !== phase.id
  )
    issues.push({
      code: 'brief-marker',
      severity: 'error',
      message: `${path} marker must identify phase ${ordinal} (${phase.id}) at revision ${planRevision}.`,
      path,
    });
  const taskIds = [...source.matchAll(BRIEF_TASK_MARKER)].map(
    (match) => parseMarker<BriefTaskMarker>(match[1]!, `${path} task`).id,
  );
  if (
    !sameIds(
      phase.tasks.map((task) => task.id),
      taskIds,
    )
  )
    issues.push({
      code: 'brief-task-ids',
      severity: 'error',
      message: `${path} task markers must exactly match phase task IDs in order.`,
      path,
    });
  const prose = source
    .replace(BRIEF_MARKER, '')
    .replace(BRIEF_TASK_MARKER, '')
    .replace(/<!-- \/diffpi-brief-task -->/g, '');
  if (/<!--[^]*?-->|\b(?:TODO|TBD)\b|define during implementation/i.test(prose))
    issues.push({
      code: 'brief-placeholder',
      severity: 'error',
      message: `${path} contains placeholder content.`,
      path,
    });
  try {
    if (isPlaceholder(section(source, 'Summary'))) throw new Error('Summary is empty.');
    for (const task of phase.tasks) {
      const taskStart = source.indexOf(`<!-- diffpi-brief-task: ${json({ id: task.id })} -->`);
      const taskEnd = source.indexOf('<!-- /diffpi-brief-task -->', taskStart);
      if (taskStart < 0 || taskEnd < 0) throw new Error(`Task ${task.id} body is missing.`);
      const body = source.slice(taskStart, taskEnd);
      for (const heading of ['Ordered Steps', 'File Scopes', 'Acceptance Criteria']) {
        const content = briefSubsection(body, heading);
        if (!parseBullets(content).length || parseBullets(content).some(isPlaceholder))
          throw new Error(`Task ${task.id} ${heading} is incomplete.`);
      }
    }
  } catch (error) {
    issues.push({ code: 'brief-incomplete', severity: 'error', message: `${path}: ${(error as Error).message}`, path });
  }
}

// Utils ----------------------------------------------------------------------

function section(source: string, heading: string): string {
  const match = source.match(new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, 'm'));
  if (!match?.index) {
    if (match?.index === 0) return '';
    throw new Error(`Missing required heading: ${heading}.`);
  }
  const start = match.index + match[0].length;
  const rest = source.slice(start);
  const end = rest.search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

function subsection(source: string, parent: string, heading: string): string {
  const body = section(source, parent);
  const match = body.match(new RegExp(`^### ${escapeRegExp(heading)}\\s*$`, 'm'));
  if (match?.index === undefined) throw new Error(`Missing required heading: ${parent}/${heading}.`);
  const rest = body.slice(match.index + match[0].length);
  const end = rest.search(/^### /m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

function parseBullets(input: string): string[] {
  return [...input.matchAll(/^- (?!<!--)(.+)$/gm)].map((match) => match[1]!.trim());
}

function briefSubsection(source: string, heading: string): string {
  const match = source.match(new RegExp(`^#### ${escapeRegExp(heading)}\\s*$`, 'm'));
  if (match?.index === undefined) throw new Error(`Missing required brief heading: ${heading}.`);
  const rest = source.slice(match.index + match[0].length);
  const end = rest.search(/^#### |^<!-- \/diffpi-brief-task -->/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

function parseListValue(body: string, label: string): string[] {
  const match = new RegExp(`^ {2}- ${escapeRegExp(label)}:[ \\t]*(.*)$`, 'm').exec(body);
  if (!match) return [];
  const inline = (match[1] ?? '').trim();
  if (inline) return parseCsv(inline);
  const remainder = body.slice(match.index + match[0].length);
  const nextField = remainder.search(/^ {2}- /m);
  const block = nextField < 0 ? remainder : remainder.slice(0, nextField);
  const values: string[] = [];
  for (const line of block.split('\n')) {
    const item = /^ {4}- (.*)$/.exec(line);
    if (item) {
      values.push(item[1] ?? '');
      continue;
    }
    const continuation = /^ {6}(.*)$/.exec(line);
    if (continuation && values.length) values[values.length - 1] += `\n${continuation[1] ?? ''}`;
  }
  return values.filter((value) => value.length > 0);
}

function parseCsv(value?: string): string[] {
  if (!value || value.trim().toLowerCase() === 'none') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertStableId(value: string, label: string): void {
  if (!zx.id.safeParse(value).success)
    throw new Error(`${label} must be a lowercase stable slug, not a path: ${value}`);
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    assertStableId(id, label);
    if (seen.has(id)) throw new Error(`Duplicate ${label}: ${id}.`);
    seen.add(id);
  }
}

function cleanPlaceholder(value: string): string {
  return value.replace(/<!--[^]*?-->/g, '').trim();
}

function isPlaceholder(value: string): boolean {
  const normalized = cleanPlaceholder(value).trim();
  return (
    normalized.length === 0 ||
    /^(?:todo|tbd|none|n\/a)$/i.test(normalized) ||
    /define during implementation|describe the|add requirements|add implementation/i.test(normalized)
  );
}

function sameIds(expected: readonly string[], actual: readonly string[]): boolean {
  return expected.length === actual.length && expected.every((value, index) => actual[index] === value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseMarker<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Malformed ${label} marker JSON.`);
  }
}

function bulletList(values: readonly string[], empty = ''): string {
  if (!values.length) return empty;
  return values
    .flatMap((value) => {
      const [first = '', ...continuations] = value.split('\n');
      return [`- ${first}`, ...continuations.map((line) => `  ${line}`)];
    })
    .join('\n');
}

function list(values: readonly string[]): string {
  return values.length ? values.join(', ') : 'none';
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, entry) => (entry === undefined ? undefined : entry));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
