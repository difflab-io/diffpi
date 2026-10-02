import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

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

/** Read-only layout check. The independent reviewer judges all plan content. */
export async function verifyLivePlan(requested: string, cwd = process.cwd()): Promise<PlanVerification> {
  const path = resolve(cwd, requested);
  let planPath = path;
  try {
    if ((await stat(path)).isDirectory()) planPath = join(path, 'PLAN.md');
  } catch {
    // Report the missing plan below.
  }
  const issues: PlanVerificationIssue[] = [];
  const briefPaths: string[] = [];
  const planDir = dirname(planPath);
  if (basename(planPath) !== 'PLAN.md') {
    addIssue(issues, planPath, 0, 'path', 'Select PLAN.md or its directory.');
    return { planPath, briefPaths, ok: false, issues };
  }
  if (
    !/^\d{6}(?:-[a-z0-9]+)+$/.test(basename(planDir)) ||
    basename(dirname(planDir)) !== 'plan' ||
    basename(dirname(dirname(planDir))) !== '.diffpi'
  )
    addIssue(issues, planPath, 0, 'layout', 'Place PLAN.md under .diffpi/plan/<YYMMDD[-ticket]-short-slug>/.');

  let source: string;
  try {
    source = await readFile(planPath, 'utf8');
  } catch {
    addIssue(issues, planPath, 0, 'missing-plan', 'PLAN.md is not readable.');
    return { planPath, briefPaths, ok: false, issues };
  }
  const planLines = visibleLines(source);
  checkHeadings(planLines, planPath, ['Intent', 'Requirements', 'Design', 'Phases', 'References'], issues);
  const phases = planLines.flatMap((line, i) => (/^### Phase \d+:\s*\S/.test(line) ? [i] : []));
  if (!phases.length) addIssue(issues, planPath, 0, 'phases', 'Add at least one numbered phase heading.');
  for (const [index, line] of phases.entries()) {
    if (!planLines[line]?.startsWith(`### Phase ${index + 1}: `))
      addIssue(issues, planPath, line + 1, 'phase-order', 'Number phase headings from 1 without gaps.');
  }

  const implementation = join(planDir, 'implementation');
  let rootEntries: string[] = [];
  let briefEntries: string[] = [];
  try {
    rootEntries = await readdir(planDir);
    briefEntries = await readdir(implementation);
  } catch {
    // Missing brief paths are reported in the loop below.
  }
  for (const entry of rootEntries) {
    const directory = ['implementation', 'revisions', 'logs'].includes(entry);
    const logFile = entry === 'logs.jsonl';
    let valid = entry === 'PLAN.md';
    if (directory || logFile) {
      try {
        const details = await lstat(join(planDir, entry));
        valid = !details.isSymbolicLink() && (directory ? details.isDirectory() : details.isFile());
      } catch {
        // Report the invalid layout below.
      }
    }
    if (!valid)
      addIssue(
        issues,
        join(planDir, entry),
        0,
        'layout',
        'Only PLAN.md, implementation/, revisions/, logs.jsonl, and historical logs/ belong in the plan directory.',
      );
  }
  for (const entry of briefEntries) {
    const ordinal = /^phase-(\d+)\.md$/.exec(entry)?.[1];
    if (!ordinal || !Number(ordinal) || Number(ordinal) > phases.length || entry !== `phase-${Number(ordinal)}.md`)
      addIssue(
        issues,
        join(implementation, entry),
        0,
        'extra-brief',
        'Only matching numbered phase briefs belong in implementation/.',
      );
  }
  for (let index = 0; index < phases.length; index++) {
    const brief = join(implementation, `phase-${index + 1}.md`);
    briefPaths.push(brief);
    try {
      const lines = visibleLines(await readFile(brief, 'utf8'));
      if (!/^# Phase \d+:\s*\S/.test(lines[0] ?? '') || !lines[0]?.startsWith(`# Phase ${index + 1}: `))
        addIssue(issues, brief, 1, 'phase-title', `Start with # Phase ${index + 1}: <title>.`);
      checkHeadings(lines, brief, ['Objective', 'Files Affected', 'Tasks', 'Implementation Constraints'], issues);
    } catch {
      addIssue(issues, brief, 0, 'missing-brief', 'Numbered phase brief is not readable.');
    }
  }
  return { planPath, briefPaths, ok: issues.length === 0, issues };
}

function addIssue(issues: PlanVerificationIssue[], file: string, line: number, code: string, message: string): void {
  issues.push({ file, line, code, message });
}

function visibleLines(source: string): string[] {
  let fenced = false;
  return source.split(/\r?\n/).map((line) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return '';
    }
    return fenced ? '' : line;
  });
}

function checkHeadings(lines: string[], file: string, names: string[], issues: PlanVerificationIssue[]): void {
  const found = lines.flatMap((line, i) => (line.startsWith('## ') ? [{ text: line, line: i + 1 }] : []));
  const expected = names.map((name) => `## ${name}`);
  if (found.map(({ text }) => text).join('\n') !== expected.join('\n'))
    addIssue(issues, file, found[0]?.line ?? 0, 'headings', `Expected headings, in order: ${expected.join(', ')}.`);
}
