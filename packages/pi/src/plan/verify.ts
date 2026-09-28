import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export interface PlanVerificationIssue {
  file: string;
  line: number;
  code: string;
  message: string;
}

export interface PlanVerification {
  planPath: string;
  briefPaths: string[];
  ok: boolean;
  issues: PlanVerificationIssue[];
}

/** Read-only, stateless verification of the current live-file plan format. */
export async function verifyLivePlan(requested: string, cwd = process.cwd()): Promise<PlanVerification> {
  return verifyLivePlanInternal(requested, cwd);
}

interface Task {
  id: string;
  title: string;
}

interface Phase {
  id: string;
  title: string;
  prerequisites: string[];
  tasks: Task[];
}

function linesOf(source: string): string[] {
  // Ignore headings and checkboxes inside code blocks, not their surrounding prose.
  let fenced = false;
  return source.split(/\r?\n/).map((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

function issue(issues: PlanVerificationIssue[], file: string, line: number, code: string, message: string): void {
  issues.push({ file, line, code, message });
}

function field(lines: string[], start: number, end: number, name: string): { value: string; line: number } | undefined {
  const label = `- **${name}:**`;
  for (let i = start; i < end; i++) {
    if (lines[i]?.trimStart().startsWith(label)) {
      return { value: lines[i]!.trimStart().slice(label.length).trim(), line: i + 1 };
    }
  }
  return undefined;
}

function heading(lines: string[], text: string): number[] {
  return lines.flatMap((line, i) => (line.trim() === text ? [i] : []));
}

function requireSection(lines: string[], file: string, text: string, issues: PlanVerificationIssue[]): number {
  const matches = heading(lines, text);
  if (matches.length !== 1)
    issue(
      issues,
      file,
      matches[0] === undefined ? 0 : matches[0] + 1,
      'section',
      `Expected exactly one ${text} section.`,
    );
  return matches[0] ?? -1;
}

function parsePlan(source: string, file: string, issues: PlanVerificationIssue[]): Phase[] {
  const lines = linesOf(source);
  for (const name of ['Intent', 'Requirements', 'Design', 'Phases', 'References']) {
    requireSection(lines, file, `## ${name}`, issues);
  }
  for (const name of ['Plan ID', 'Branch', 'Status']) {
    const entry = field(lines, 0, lines.length, name);
    if (!entry?.value) issue(issues, file, entry?.line ?? 0, 'metadata', `Missing ${name}.`);
    if (name === 'Status' && entry?.value && !/^(?:DRAFT|READY|IN_PROGRESS|BLOCKED|COMPLETED)$/i.test(entry.value)) {
      issue(issues, file, entry.line, 'status', 'Status must be DRAFT, READY, IN_PROGRESS, BLOCKED, or COMPLETED.');
    }
  }
  const misplacedScope = lines.findIndex((line) =>
    /^\s*(?:-\s+\*\*File scopes:\*\*|#{3,}\s+File Scopes\b)/i.test(line),
  );
  if (misplacedScope >= 0)
    issue(
      issues,
      file,
      misplacedScope + 1,
      'file-scope',
      'File scope belongs only in each implementation brief’s Phase File Tree.',
    );
  const phaseHeading = /^### Phase (\d+):\s*(\S.*)$/;
  const phaseLines = lines.flatMap((line, i) => (phaseHeading.test(line) ? [i] : []));
  if (!phaseLines.length) issue(issues, file, 0, 'phases', 'Add at least one numbered phase.');
  const phases: Phase[] = [];
  const taskIds = new Set<string>();
  for (const [index, start] of phaseLines.entries()) {
    const match = phaseHeading.exec(lines[start]!)!;
    const end = phaseLines[index + 1] ?? lines.length;
    if (Number(match[1]) !== index + 1)
      issue(issues, file, start + 1, 'phase-order', 'Phase numbers must start at 1 and be contiguous.');
    const id = field(lines, start + 1, end, 'Phase ID');
    const prerequisite = field(lines, start + 1, end, 'Prerequisites');
    if (!id?.value) issue(issues, file, id?.line ?? start + 1, 'phase-id', 'Phase ID is required.');
    if (!prerequisite?.value)
      issue(
        issues,
        file,
        prerequisite?.line ?? start + 1,
        'prerequisites',
        'Phase prerequisites are required (use None if empty).',
      );
    const prereqs =
      prerequisite?.value && !/^none$/i.test(prerequisite.value)
        ? prerequisite.value.split(',').map((value) => value.replaceAll('`', '').trim())
        : [];
    for (const required of prereqs) {
      if (!phases.some((phase) => phase.id === required)) {
        issue(
          issues,
          file,
          prerequisite?.line ?? start + 1,
          'prerequisites',
          `Prerequisite ${required || '(empty)'} must identify an earlier phase ID.`,
        );
      }
    }
    if (id?.value && phases.some((phase) => phase.id === id.value))
      issue(issues, file, id.line, 'phase-id', `Duplicate phase ID ${id.value}.`);
    const tasks: Task[] = [];
    for (let i = start + 1; i < end; i++) {
      const line = lines[i]!;
      if (!/^\s*- \[[ xX]\]/.test(line)) continue;
      const task = /^- \[[ xX]\] \*\*([a-z0-9]+(?:-[a-z0-9]+)*):?\*\* (\S.*)$/.exec(line);
      if (!task) {
        issue(issues, file, i + 1, 'task-format', 'Use a flat checkbox with a bold stable task ID and a title.');
        continue;
      }
      if (taskIds.has(task[1]!)) issue(issues, file, i + 1, 'task-id', `Duplicate task ID ${task[1]}.`);
      taskIds.add(task[1]!);
      tasks.push({ id: task[1]!, title: task[2]!.trim() });
    }
    if (!tasks.length) issue(issues, file, start + 1, 'tasks', 'Each phase needs at least one task.');
    phases.push({ id: id?.value ?? '', title: match[2]!.trim(), prerequisites: prereqs, tasks });
  }
  return phases;
}

function parseBrief(source: string, file: string, phase: Phase, number: number, issues: PlanVerificationIssue[]): void {
  const lines = linesOf(source);
  const title = lines[0]?.match(/^# Phase (\d+):\s*(\S.*)$/);
  if (!title || Number(title[1]) !== number || title[2]?.trim() !== phase.title) {
    issue(issues, file, 1, 'phase-title', `Expected # Phase ${number}: ${phase.title}.`);
  }
  const id = field(lines, 0, lines.length, 'Phase ID');
  if (id?.value !== phase.id) issue(issues, file, id?.line ?? 0, 'phase-id', `Expected Phase ID ${phase.id}.`);
  const prereqs = field(lines, 0, lines.length, 'Prerequisites');
  const expected = phase.prerequisites.length ? phase.prerequisites.join(', ') : 'None';
  if (prereqs?.value !== expected)
    issue(issues, file, prereqs?.line ?? 0, 'prerequisites', `Expected prerequisites ${expected}.`);
  for (const section of ['Objective', 'Tasks', 'Implementation Constraints', 'Phase File Tree']) {
    requireSection(lines, file, `## ${section}`, issues);
  }
  for (const section of ['Libraries and Algorithms', 'Constraints']) {
    requireSection(lines, file, `### ${section}`, issues);
  }
  const taskHeading = /^### (\d+)\.\s*(\S.*)$/;
  const tasksStart = heading(lines, '## Tasks')[0] ?? 0;
  const tasksEnd = heading(lines, '## Implementation Constraints')[0] ?? lines.length;
  const taskLines = lines.flatMap((line, i) => (i > tasksStart && i < tasksEnd && taskHeading.test(line) ? [i] : []));
  if (taskLines.length !== phase.tasks.length)
    issue(
      issues,
      file,
      tasksStart + 1,
      'task-parity',
      `Expected ${phase.tasks.length} matching task sections, found ${taskLines.length}.`,
    );
  for (const [index, start] of taskLines.entries()) {
    const end = taskLines[index + 1] ?? tasksEnd;
    const match = taskHeading.exec(lines[start]!)!;
    const planTask = phase.tasks[index];
    const id = field(lines, start + 1, end, 'Task ID');
    if (
      !planTask ||
      Number(match[1]) !== index + 1 ||
      match[2]?.trim() !== planTask.title ||
      id?.value !== planTask.id
    ) {
      issue(issues, file, start + 1, 'task-parity', `Task ${index + 1} must match its PLAN.md ID, title, and order.`);
    }
    const steps = field(lines, start + 1, end, 'Steps');
    const stepStart = steps ? steps.line : end;
    if (!steps || !lines.slice(stepStart, end).some((line) => /^\s+1\.\s+\S/.test(line))) {
      issue(issues, file, start + 1, 'steps', 'Add numbered implementation steps starting at 1.');
    }
    const verification = lines.findIndex((line, i) => i > start && i < end && /^\s*- \*\*Verify:\*\*/.test(line));
    const inline = verification >= 0 && /\*\*Verify:\*\*\s*\S/.test(lines[verification]!);
    const nested = verification >= 0 && lines.slice(verification + 1, end).some((line) => /^\s{2,}-\s+\S/.test(line));
    if (!inline && !nested) {
      issue(
        issues,
        file,
        verification >= 0 ? verification + 1 : start + 1,
        'verification',
        'Nest a nonempty **Verify:** instruction under this task.',
      );
    }
    const acceptance = field(lines, start + 1, end, 'Acceptance');
    if (!acceptance?.value) issue(issues, file, start + 1, 'task-detail', 'Add nonempty Acceptance for this task.');
    const misplacedScope = lines.findIndex(
      (line, i) => i > start && i < end && /^\s*(?:-\s+\*\*File scopes:\*\*|#{3,}\s+File Scopes\b)/i.test(line),
    );
    if (misplacedScope >= 0)
      issue(issues, file, misplacedScope + 1, 'file-scope', 'Put the phase’s file scope only in its Phase File Tree.');
  }
  const treeStart = heading(lines, '## Phase File Tree')[0];
  if (treeStart === undefined) return;
  const treeEnd = lines.findIndex((line, i) => i > treeStart && /^## /.test(line));
  // Fences were hidden by linesOf; use the original source for precise tree checks.
  const original = source.split(/\r?\n/).slice(treeStart, treeEnd < 0 ? undefined : treeEnd);
  const opens = original.flatMap((line, i) => (/^```text\s*$/.test(line) ? [i] : []));
  if (opens.length !== 1) {
    issue(issues, file, treeStart + 1, 'tree', 'Use exactly one fenced text tree for the phase.');
    return;
  }
  const close = original.findIndex((line, i) => i > opens[0]! && /^```\s*$/.test(line));
  if (close < 0) {
    issue(issues, file, treeStart + 1, 'tree', 'Close the fenced phase file tree.');
    return;
  }
  let leaves = 0;
  for (let i = opens[0]! + 1; i < close; i++) {
    const branch = /^\s*[│ ]*(?:├──|└──)\s+(.+)$/.exec(original[i]!);
    if (!branch || branch[1]!.trimEnd().endsWith('/')) continue;
    leaves++;
    if (!/^\[(?:ADD|MODIFY|REMOVE|VERIFY|MOVE from: [^\]]+)\]\s+\S/.test(branch[1]!)) {
      issue(
        issues,
        file,
        treeStart + i + 1,
        'tree-label',
        'Every file leaf must start with an action label after the tree branch.',
      );
    }
  }
  if (!leaves) issue(issues, file, treeStart + 1, 'tree', 'Add at least one action-labeled file leaf.');
}

async function verifyLivePlanInternal(requested: string, cwd: string): Promise<PlanVerification> {
  const path = resolve(cwd, requested);
  let planPath = path;
  try {
    if ((await stat(path)).isDirectory()) planPath = join(path, 'PLAN.md');
  } catch {
    // Keep the resolved path so the result points to the missing file.
  }
  const issues: PlanVerificationIssue[] = [];
  const briefPaths: string[] = [];
  if (basename(planPath) !== 'PLAN.md') {
    issue(issues, planPath, 0, 'path', 'Select a PLAN.md file or its directory.');
    return { planPath, briefPaths, ok: false, issues };
  }
  let source: string;
  try {
    source = await readFile(planPath, 'utf8');
  } catch {
    issue(issues, planPath, 0, 'missing-plan', 'PLAN.md is not readable.');
    return { planPath, briefPaths, ok: false, issues };
  }
  const phases = parsePlan(source, planPath, issues);
  const implementation = join(resolve(planPath, '..'), 'implementation');
  let entries: string[];
  try {
    entries = await readdir(implementation);
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    const match = /^phase-(\d+)\.md$/.exec(entry);
    if (
      match &&
      (Number(match[1]) < 1 || Number(match[1]) > phases.length || entry !== `phase-${Number(match[1])}.md`)
    ) {
      issue(issues, join(implementation, entry), 0, 'extra-brief', 'No matching numbered phase exists for this brief.');
    }
  }
  for (const [index, phase] of phases.entries()) {
    const brief = join(implementation, `phase-${index + 1}.md`);
    briefPaths.push(brief);
    try {
      parseBrief(await readFile(brief, 'utf8'), brief, phase, index + 1, issues);
    } catch {
      issue(issues, brief, 0, 'missing-brief', 'Numbered phase brief is not readable.');
    }
  }
  return { planPath, briefPaths, ok: issues.length === 0, issues };
}
