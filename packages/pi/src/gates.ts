import { mise } from './extensions/misex';

export const CONVENTIONAL_COMMIT = /^(feat|fix|perf|refactor|docs|chore|test|build|ci|style|revert)(\([^)]+\))?!?: .+/;
const MISE_GATES = ['format:check', 'lint', 'test'] as const;

export type GateStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface GateResult {
  name: string;
  status: GateStatus;
  detail: string;
}

export function checkConventionalSubject(subject: string): GateResult {
  const trimmed = subject.trim();
  const ok = CONVENTIONAL_COMMIT.test(trimmed);
  return {
    name: 'conventional-subject',
    status: ok ? 'pass' : 'warn',
    detail: ok ? trimmed : `not a conventional-commit subject: "${trimmed}"`,
  };
}

export async function runMiseGates(cwd: string): Promise<GateResult[]> {
  const tasks = await discoverMiseTasks(cwd);
  const results: GateResult[] = [];
  for (const gate of MISE_GATES) {
    const targets = tasks.get(gate) ?? [];
    if (targets.length === 0) {
      results.push({ name: gate, status: 'skip', detail: 'no mise recipe' });
      continue;
    }
    const invocations = targets.flatMap((target, index) => (index === 0 ? [target] : [':::', target]));
    const result = await mise.run(['run', ...invocations], { cwd });
    results.push({
      name: gate,
      status: result.code === 0 ? 'pass' : 'fail',
      detail: result.code === 0 ? 'clean' : (result.stderr.trim() || result.stdout.trim()).slice(-400),
    });
  }
  return results;
}

export function ciGate(checksOutput: string): GateResult {
  const text = checksOutput.toLowerCase();
  if (!text.trim()) return { name: 'ci', status: 'skip', detail: 'no CI output' };
  if (/\bfail|error\b/.test(text)) return { name: 'ci', status: 'warn', detail: 'CI failing' };
  if (/\bpending|in progress|queued\b/.test(text)) return { name: 'ci', status: 'warn', detail: 'CI pending' };
  return { name: 'ci', status: 'pass', detail: 'CI green' };
}

async function discoverMiseTasks(cwd: string): Promise<Map<string, string[]>> {
  const result = await mise.run(['tasks', '--json', '--all'], { cwd });
  if (result.code !== 0) return new Map();
  return parseMiseTasks(result.stdout);
}

export function parseMiseTasks(input: string): Map<string, string[]> {
  let tasks: Array<{ name?: string; aliases?: string[] }>;
  try {
    tasks = JSON.parse(input) as typeof tasks;
  } catch {
    return new Map();
  }
  if (!Array.isArray(tasks)) return new Map();

  const found = new Map<string, string[]>();
  for (const gate of MISE_GATES) {
    const targets = tasks.flatMap((task) => {
      if (typeof task.name !== 'string') return [];
      return task.name === gate || task.name.endsWith(`:${gate}`) || task.aliases?.includes(gate) ? [task.name] : [];
    });
    if (targets.length > 0) found.set(gate, [...new Set(targets)]);
  }
  return found;
}
