import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './process';

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
  const tasks = await readMiseTasks(cwd);
  const results: GateResult[] = [];
  for (const gate of MISE_GATES) {
    if (!tasks.has(gate)) {
      results.push({ name: gate, status: 'skip', detail: 'no mise recipe' });
      continue;
    }
    const result = await run('mise', ['run', gate], { cwd });
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

async function readMiseTasks(cwd: string): Promise<Set<string>> {
  const tasks = new Set<string>();
  for (const file of ['mise.toml', join('..', '..', 'mise.toml')]) {
    try {
      const text = await readFile(join(cwd, file), 'utf8');
      for (const match of text.matchAll(/^\[tasks\.(?:"([^"]+)"|([\w:.-]+))\]/gm)) {
        tasks.add(match[1] ?? match[2]);
      }
      for (const match of text.matchAll(/alias\s*=\s*\[([^\]]*)\]/g)) {
        for (const alias of match[1].matchAll(/"([^"]+)"/g)) tasks.add(alias[1]);
      }
    } catch {
      // No mise file at this location.
    }
  }
  return tasks;
}
