import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isLocalResponse } from './review';
import type { ReviewComment, ReviewThreadRecord } from './review';
import { gitToplevel } from './extensions/gitx';
import { listSessions } from './extensions/tuicrx';

export { addComment, launch, listSessions, tuicrAvailable } from './extensions/tuicrx';

export interface SessionSummary {
  slug: string;
  kind: string;
  path: string;
  updatedAt: string;
  commentCount: number;
  anchor: string;
  active: boolean;
}

interface SessionCommentJson {
  id?: string;
  content: string;
  side?: 'old' | 'new' | null;
  username?: string;
  author?: string;
}

interface SessionFileJson {
  file_comments?: SessionCommentJson[];
  line_comments?: Record<string, SessionCommentJson[]>;
}

export interface SessionJson {
  id?: string;
  branch_name?: string;
  repo_path?: string;
  review_comments?: SessionCommentJson[];
  files?: Record<string, SessionFileJson>;
}

export async function resolveSession(cwd: string, branch: string): Promise<SessionSummary | undefined> {
  const sessions = await listSessions(cwd);
  return findMatchingSession(sessions, cwd, branch);
}

export async function resolveReviewSession(
  cwd: string,
  target: { branch: string; workingTree?: boolean; owner?: string; repo?: string; number?: number },
): Promise<SessionSummary | undefined> {
  if (!target.workingTree && target.owner && target.repo && target.number !== undefined) {
    return resolvePrSession(cwd, target.owner, target.repo, target.number);
  }
  return resolveSession(cwd, target.branch);
}

export async function resolvePrSession(
  cwd: string,
  owner: string,
  repo: string,
  number: number,
): Promise<SessionSummary | undefined> {
  const coordinate = `${owner}/${repo}`.toLowerCase();
  const sessions = await listSessions(cwd);
  return sessions.find((session) => {
    const slug = session.slug.toLowerCase();
    return (
      session.kind === 'pr' &&
      slug.includes(coordinate) &&
      (slug.endsWith(`/pr/${number}`) || slug.endsWith(`/mr/${number}`))
    );
  });
}

export async function findMatchingSession(
  sessions: readonly SessionSummary[],
  cwd: string,
  branch: string,
): Promise<SessionSummary | undefined> {
  const repository = await canonicalPath(await gitToplevel(cwd));
  for (const session of sessions) {
    if (session.kind !== 'local') continue;
    try {
      const data = await readSession(session.path);
      if (data.branch_name !== branch || !data.repo_path) continue;
      if ((await canonicalPath(data.repo_path)) === repository) return session;
    } catch {
      // Ignore stale or malformed sessions and continue looking for an exact match.
    }
  }
  return undefined;
}

export async function readSession(path: string): Promise<SessionJson> {
  const content = await readFile(path, 'utf8');
  try {
    return JSON.parse(content) as SessionJson;
  } catch {
    throw new Error(`Cannot parse tuicr session JSON: ${path}`);
  }
}

export function toLocalReviewThreads(session: SessionJson): ReviewThreadRecord[] {
  const threads: ReviewThreadRecord[] = [];
  const add = (comment: SessionCommentJson, location: Pick<ReviewThreadRecord, 'file' | 'line'> = {}) => {
    if (isLocalResponse(comment.content)) return;
    const author = commentAuthor(comment);
    threads.push({
      id: comment.id ?? `local-${threads.length + 1}`,
      ...location,
      body: comment.content,
      ...(author ? { author } : {}),
      resolved: false,
      question: /\?\s*$/.test(comment.content.trim()),
    });
  };

  for (const comment of session.review_comments ?? []) add(comment);
  for (const [file, entry] of Object.entries(session.files ?? {})) {
    for (const comment of entry.file_comments ?? []) add(comment, { file });
    for (const [lineKey, lineComments] of Object.entries(entry.line_comments ?? {})) {
      const line = Number.parseInt(lineKey, 10);
      if (!Number.isFinite(line)) continue;
      for (const comment of lineComments) add(comment, { file, line });
    }
  }
  return threads;
}

export function toFindings(
  session: SessionJson,
  options: { agentOnly?: boolean; excludeLocalResponses?: boolean } = {},
): { comments: ReviewComment[]; body: string } {
  const comments: ReviewComment[] = [];
  const include = (comment: SessionCommentJson) =>
    (!options.agentOnly || commentAuthor(comment)?.startsWith('Agent: ')) &&
    (!options.excludeLocalResponses || !isLocalResponse(comment.content));
  const bodyParts = (session.review_comments ?? []).flatMap((comment) => (include(comment) ? [comment.content] : []));
  for (const [file, entry] of Object.entries(session.files ?? {})) {
    const fileComments = (entry.file_comments ?? []).flatMap((comment) => (include(comment) ? [comment.content] : []));
    if (fileComments.length > 0) bodyParts.push(`File: ${file}\n\n${fileComments.join('\n\n')}`);
    for (const [lineKey, lineComments] of Object.entries(entry.line_comments ?? {})) {
      const line = Number.parseInt(lineKey, 10);
      if (!Number.isFinite(line)) continue;
      for (const lineComment of lineComments) {
        if (!include(lineComment)) continue;
        const comment: ReviewComment = {
          file,
          line,
          side: lineComment.side === 'old' ? 'LEFT' : 'RIGHT',
          body: lineComment.content,
        };
        const author = commentAuthor(lineComment);
        if (author) comment.author = author;
        comments.push(comment);
      }
    }
  }
  return {
    comments,
    body: bodyParts.join('\n\n'),
  };
}

function commentAuthor(comment: SessionCommentJson): string | undefined {
  return comment.username ?? comment.author;
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}
