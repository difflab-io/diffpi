import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { VcsInfo } from '../environment';
import type { ReviewComment } from './types';
import { sessionsDir } from '../store';

const reviewPublicationStateSchema = z.object({
  target: z.string().optional(),
  bodies: z.array(z.string()).default([]),
  comments: z.array(z.string()).default([]),
  replies: z.array(z.string()).default([]),
  overlayPath: z.string().optional(),
});

export interface ReviewPublicationState {
  target: string;
  bodies: string[];
  comments: string[];
  replies: string[];
  overlayPath?: string;
}

export function reviewBodyFingerprint(body: string): string {
  return digest(body);
}

export function reviewCommentFingerprint(comment: ReviewComment): string {
  return digest([comment.file, String(comment.line), comment.side ?? 'RIGHT', comment.body].join('\0'));
}

export function reviewReplyFingerprint(threadId: string, body: string): string {
  return digest(`${threadId}\0${body}`);
}

export function unpublishedReviewComments(
  comments: readonly ReviewComment[],
  knownFingerprints: ReadonlySet<string>,
): ReviewComment[] {
  return comments.filter((comment) => !knownFingerprints.has(reviewCommentFingerprint(comment)));
}

export async function loadReviewPublicationState(
  cwd: string,
  vcs: VcsInfo,
  number: number,
  homeDir?: string,
): Promise<{ path: string; state: ReviewPublicationState }> {
  const target = `${vcs.provider}:${vcs.owner}/${vcs.repo}#${number}`;
  const path = join(await sessionsDir(cwd, homeDir), `review-publish-${digest(target).slice(0, 16)}.json`);
  try {
    const parsed = reviewPublicationStateSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    return { path, state: { ...parsed, target } };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { path, state: { target, bodies: [], comments: [], replies: [] } };
    }
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new Error(`Cannot parse review publication state: ${path}`);
    }
    throw error;
  }
}

export async function saveReviewPublicationState(path: string, state: ReviewPublicationState): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temp, path);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
