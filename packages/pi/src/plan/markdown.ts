import { assertStableId, assertUniqueIds } from './transitions';
import type {
  PlanDocument,
  PlanPhase,
  PlanReference,
  PlanTask,
  PlanValidationIssue,
  PlanValidationOptions,
} from './types';

const PLAN_MARKER = /<!-- diffpi-plan: (\{[^\n]+\}) -->/;
const PHASE_MARKER = /<!-- diffpi-phase: (\{[^\n]+\}) -->/g;
const TASK_MARKER = /<!-- diffpi-task: (\{[^\n]+\}) -->/g;
const SUPPORTED_SCHEMA = 1;

type PlanMarker = Pick<
  PlanDocument,
  'schemaVersion' | 'id' | 'revision' | 'branch' | 'status' | 'execution' | 'createdAt' | 'updatedAt'
>;
type PhaseMarker = Pick<PlanPhase, 'id' | 'revision' | 'status' | 'gate' | 'commit' | 'blocker'>;
type TaskMarker = Pick<PlanTask, 'id' | 'revision' | 'status' | 'owner' | 'executionId' | 'blocker'>;

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
      if (options.strict && task.acceptanceCriteria.length === 0)
        add('acceptance', 'error', `Task ${task.id} has no acceptance criteria.`, task.id);
    }
    if (options.strict && phase.tasks.length === 0)
      add('empty-phase', 'error', `Phase ${phase.id} has no tasks.`, phase.id);
  }
  for (const cycle of dependencyCycles(plan))
    add('dependency-cycle', 'error', `Dependency cycle: ${cycle.join(' -> ')}.`);
  const designWords = countDesignWords(plan);
  if (designWords > 300) add('design-length', 'warning', `Design is ${designWords} words; prefer 300 or fewer.`);
  if (options.strict && designWords > 800)
    add('design-too-long', 'error', `Design is ${designWords} words; finalization allows at most 800.`);
  if (options.strict && plan.phases.length === 0)
    add('no-phases', 'error', 'Finalization requires at least one phase.');
  if (options.strict && (options.pendingAnnotations ?? 0) > 0)
    add('pending-annotations', 'error', `${options.pendingAnnotations} annotations remain pending.`);
  return issues;
}

export function renderPlanDocument(plan: PlanDocument, previousSource?: string): string {
  if (previousSource && canPatch(previousSource, plan)) return patchMarkers(previousSource, plan);
  const marker: PlanMarker = {
    schemaVersion: plan.schemaVersion,
    id: plan.id,
    revision: plan.revision,
    branch: plan.branch,
    status: plan.status,
    execution: plan.execution,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
  const requirements = plan.requirements.length
    ? plan.requirements.map((item) => `- ${item}`).join('\n')
    : '<!-- Add requirements. -->';
  const phases = plan.phases.map(renderPhase).join('\n\n');
  const references = plan.references.length
    ? plan.references
        .map((reference) => `- <!-- diffpi-reference: ${json(reference)} --> ${reference.value}`)
        .join('\n')
    : '<!-- Add references. -->';
  return `<!-- diffpi-plan: ${json(marker)} -->
# ${plan.title}

- **Plan ID:** ${plan.id}
- **Branch:** ${plan.branch}
- **Status:** ${plan.status}
- **Revision:** ${plan.revision}

## Intent

${plan.intent || '<!-- Describe the intended outcome. -->'}

## Requirements

${requirements}

## Design

### Big Ideas

${plan.design.bigIdeas || '<!-- Describe the main approach. -->'}

### Key API Addition/Updates

${plan.design.keyApiUpdates || '<!-- Describe public API changes. -->'}

### Consequences

${plan.design.consequences || '<!-- Describe trade-offs and limitations. -->'}

## Implementation

${phases || '<!-- Add phases with plan_add_phase. -->'}

## References

${references}
`;
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
  - Steps: ${list(task.steps ?? [])}
  - Dependencies: ${list(task.dependencies)}
  - File scopes: ${list(task.fileScopes)}
  - Acceptance criteria: ${list(task.acceptanceCriteria)}
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
      steps: parseListValue(body, 'Steps'),
      dependencies: parseListValue(body, 'Dependencies'),
      fileScopes: parseListValue(body, 'File scopes'),
      acceptanceCriteria: parseListValue(body, 'Acceptance criteria'),
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

function replaceMarkerById(source: string, kind: 'phase' | 'task', id: string, marker: object): string {
  const pattern = new RegExp(`<!-- diffpi-${kind}: \\{[^\\n]*"id":"${escapeRegExp(id)}"[^\\n]*\\} -->`);
  if (!pattern.test(source)) throw new Error(`Cannot update missing ${kind} marker ${id}.`);
  return source.replace(pattern, `<!-- diffpi-${kind}: ${json(marker)} -->`);
}

function contentShape(plan: PlanDocument): unknown {
  return {
    title: plan.title,
    branch: plan.branch,
    intent: plan.intent,
    requirements: plan.requirements,
    design: plan.design,
    references: plan.references,
    phases: plan.phases.map(({ id, title, objective, dependencies, tasks }) => ({
      id,
      title,
      objective,
      dependencies,
      tasks: tasks.map(
        ({ id: taskId, title: taskTitle, steps, dependencies: taskDependencies, fileScopes, acceptanceCriteria }) => ({
          id: taskId,
          title: taskTitle,
          steps,
          dependencies: taskDependencies,
          fileScopes,
          acceptanceCriteria,
        }),
      ),
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

function parseListValue(body: string, label: string): string[] {
  const value = body.match(new RegExp(`^  - ${escapeRegExp(label)}:\\s*(.*)$`, 'm'))?.[1];
  return parseCsv(value);
}

function parseCsv(value?: string): string[] {
  if (!value || value.trim().toLowerCase() === 'none') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanPlaceholder(value: string): string {
  return value.replace(/<!--[^]*?-->/g, '').trim();
}

function parseMarker<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Malformed ${label} marker JSON.`);
  }
}

function list(values: readonly string[]): string {
  return values.length ? values.join(', ') : 'none';
}

function json(value: object): string {
  return JSON.stringify(value, (_key, entry) => (entry === undefined ? undefined : entry));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
