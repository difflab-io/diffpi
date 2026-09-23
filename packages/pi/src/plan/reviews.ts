import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { run } from '../extensions/processx';
import type { PlanRecord } from './types';

// Types ----------------------------------------------------------------------

interface PlanReviewDump {
  schemaVersion: 1;
  planId: string;
  planRevision: number;
  source: 'tuicr';
  sourceId: string;
  planSource: string;
  content: string;
}

interface PlanReview {
  path: string;
  dump: PlanReviewDump;
}

interface PlanReviewRuntime {
  execute?: (
    command: string,
    args: string[],
    cwd: string,
    interactive: boolean,
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
}

// API ------------------------------------------------------------------------

export async function createPlanReview(
  record: PlanRecord,
  runtime: PlanReviewRuntime = {},
): Promise<{ code: number; review: PlanReview }> {
  if (await readPlanReview(record)) throw new Error(`Plan revision ${record.document.revision} already has a review.`);
  const execute =
    runtime.execute ??
    ((command: string, args: string[], cwd: string, interactive: boolean) =>
      run(command, args, { cwd, capture: 'unbounded', interactive }));
  const result = await execute('tuicr', ['--file', record.dir], record.dir, true);
  const sourceId = [...result.stderr.matchAll(/^tuicr-session:\s*(\S+)\s*$/gm)].at(-1)?.[1];
  if (result.code !== 0) throw new Error(result.stderr.trim() || `tuicr exited with status ${result.code}.`);
  if (!sourceId) throw new Error('tuicr did not report a tuicr-session marker.');

  const response = await execute('tuicr', ['review', 'comments', '--session', sourceId], record.dir, false);
  if (response.code !== 0) throw new Error(response.stderr.trim() || 'Cannot read the tuicr review.');

  const review = {
    path: reviewPath(record),
    dump: {
      schemaVersion: 1,
      planId: record.id,
      planRevision: record.document.revision,
      source: 'tuicr',
      sourceId,
      planSource: record.source,
      content: response.stdout,
    },
  } satisfies PlanReview;
  await writeReview(review);
  return { code: result.code, review };
}

export async function readPlanReview(record: PlanRecord): Promise<PlanReview | undefined> {
  const path = reviewPath(record);
  let source: string;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  let dump: unknown;
  try {
    dump = JSON.parse(source);
  } catch {
    throw new Error(`Malformed plan review: ${path}.`);
  }
  if (!isPlanReviewDump(dump)) throw new Error(`Malformed plan review: ${path}.`);
  return { path, dump };
}

// Core -----------------------------------------------------------------------

function reviewPath(record: PlanRecord): string {
  return join(record.dir, 'reviews', `${record.document.revision}.json`);
}

async function writeReview(review: PlanReview): Promise<void> {
  await mkdir(dirname(review.path), { recursive: true });
  await writeFile(review.path, `${JSON.stringify(review.dump, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
}

function isPlanReviewDump(value: unknown): value is PlanReviewDump {
  if (!value || typeof value !== 'object') return false;
  const review = value as Partial<PlanReviewDump>;
  return (
    review.schemaVersion === 1 &&
    typeof review.planId === 'string' &&
    Number.isInteger(review.planRevision) &&
    review.source === 'tuicr' &&
    typeof review.sourceId === 'string' &&
    typeof review.planSource === 'string' &&
    typeof review.content === 'string'
  );
}
