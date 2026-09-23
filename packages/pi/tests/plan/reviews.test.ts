/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlanReview, readPlanReview } from '../../src/plan/reviews';
import type { PlanRecord } from '../../src/plan';

async function record(): Promise<PlanRecord> {
  const dir = await mkdtemp(join(tmpdir(), 'diffpi-reviews-'));
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

describe('plan reviews', () => {
  it('returns no review when the current plan revision has not been reviewed', async () => {
    expect(await readPlanReview(await record())).toBeUndefined();
  });

  it('stores one immutable tuicr dump per plan revision', async () => {
    const item = await record();
    const calls: string[][] = [];
    const content = JSON.stringify([{ id: 'c1', content: 'Change this.', path: 'PLAN.md', line: 2 }]);
    const runtime = {
      execute: async (_command: string, args: string[]) => {
        calls.push(args);
        return args[0] === '--file'
          ? { code: 0, stdout: '', stderr: 'tuicr-session: demo/session\n' }
          : { code: 0, stdout: content, stderr: '' };
      },
    };
    const result = await createPlanReview(item, runtime);

    expect(calls).toEqual([
      ['--file', item.dir],
      ['review', 'comments', '--session', 'demo/session'],
    ]);
    expect(result.review.path).toBe(join(item.dir, 'reviews', '1.json'));
    expect(result.review.dump).toEqual({
      schemaVersion: 1,
      planId: item.id,
      planRevision: 1,
      source: 'tuicr',
      sourceId: 'demo/session',
      planSource: item.source,
      content,
    });
    expect(JSON.parse(await readFile(result.review.path, 'utf8'))).toEqual(result.review.dump);
    expect(await readPlanReview(item)).toEqual(result.review);
    await expect(createPlanReview(item, runtime)).rejects.toThrow();

    item.document.revision = 2;
    expect(await readPlanReview(item)).toBeUndefined();
  });

  it('rejects malformed review dumps for the current revision', async () => {
    const item = await record();
    await mkdir(join(item.dir, 'reviews'));
    await writeFile(join(item.dir, 'reviews', '1.json'), '{not json');
    await expect(readPlanReview(item)).rejects.toThrow('Malformed plan review');
  });
});
