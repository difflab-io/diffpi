/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { annotatePlan, readPlanAnnotations } from '../../src/plan/annotations';
import type { PlanRecord } from '../../src/plan';

async function record(): Promise<PlanRecord> {
  const dir = await mkdtemp(join(tmpdir(), 'diffpi-annotations-'));
  const planPath = join(dir, 'PLAN.md');
  const source = '# Plan\nline two\n';
  await writeFile(planPath, source);
  await writeFile(join(dir, 'logs.txt'), '');
  return {
    id: '260919-demo',
    dir,
    planPath,
    logPath: join(dir, 'logs.txt'),
    source,
    document: { revision: 1 } as never,
  };
}

describe('plan annotations', () => {
  it('uses exact tuicr file argv and reads pending line context', async () => {
    const item = await record();
    const calls: string[][] = [];
    const runtime = {
      execute: async (_command: string, args: string[]) => {
        calls.push(args);
        return args[0] === '--file'
          ? { code: 0, stdout: '', stderr: 'tuicr-session: demo/session\n' }
          : {
              code: 0,
              stdout: JSON.stringify([
                { id: 'c1', content: 'Change this.', path: 'PLAN.md', start_line: 2, end_line: 2 },
              ]),
              stderr: '',
            };
      },
    };
    await annotatePlan(item, runtime);
    const annotations = await readPlanAnnotations(item, { runtime });
    expect(calls[0]).toEqual(['--file', item.planPath]);
    expect(annotations.pending[0]?.context).toBe('line two');
    expect(JSON.parse(await readFile(join(item.dir, 'annotations.json'), 'utf8')).sessionSlug).toBe('demo/session');
  });
});
