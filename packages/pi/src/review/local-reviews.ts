import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { reviewsDir } from '../store';
import { readSession, toLocalReviewThreads, type SessionSummary } from '../extensions/tuicrx';
import { reviewSlug, type ReviewThreadRecord } from './types';

// Types ----------------------------------------------------------------------

export interface LocalReviewDump {
  schemaVersion: 1;
  id: string;
  revision: number;
  branch: string;
  base: string;
  createdAt: string;
  diff: string;
  comments: ReviewThreadRecord[];
  tuicr: {
    slug: string;
    output: string;
  };
}

export interface CaptureLocalReviewInput {
  cwd: string;
  branch: string;
  base: string;
  diff: string;
  session: SessionSummary;
  now?: () => Date;
  homeDir?: string;
}

// API ------------------------------------------------------------------------

export async function captureLocalReview(
  input: CaptureLocalReviewInput,
): Promise<{ path: string; dump: LocalReviewDump }> {
  const id = reviewSlug(input.branch) || 'local-review';
  const dir = join(await reviewsDir(input.cwd, input.homeDir), id);
  await mkdir(dir, { recursive: true });
  const revision = await nextRevision(dir);
  const output = await readFile(input.session.path, 'utf8');
  const comments = toLocalReviewThreads(await readSession(input.session.path));
  const dump: LocalReviewDump = {
    schemaVersion: 1,
    id,
    revision,
    branch: input.branch,
    base: input.base,
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
    diff: input.diff,
    comments,
    tuicr: { slug: input.session.slug, output },
  };
  const path = join(dir, `${revision}.json`);
  await writeFile(path, `${JSON.stringify(dump, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await unlink(input.session.path);
  return { path, dump };
}

export async function readLocalReview(
  cwd: string,
  branch: string,
  revision?: number,
  homeDir?: string,
): Promise<LocalReviewDump | undefined> {
  const id = reviewSlug(branch) || 'local-review';
  const dir = join(await reviewsDir(cwd, homeDir), id);
  const selected = revision ?? (await latestRevision(dir));
  if (!selected) return undefined;
  try {
    return JSON.parse(await readFile(join(dir, `${selected}.json`), 'utf8')) as LocalReviewDump;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

// Core -----------------------------------------------------------------------

async function nextRevision(dir: string): Promise<number> {
  return (await latestRevision(dir)) + 1;
}

// Utils ----------------------------------------------------------------------

async function latestRevision(dir: string): Promise<number> {
  try {
    return (await readdir(dir)).reduce((latest, name) => {
      const match = name.match(/^(\d+)\.json$/);
      return match ? Math.max(latest, Number(match[1])) : latest;
    }, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}
