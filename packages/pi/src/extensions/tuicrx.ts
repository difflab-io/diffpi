import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gitToplevel } from './gitx';
import { findExecutable, run, runChecked } from './processx';
import { diffpiLaunchName, openInNewTab, type LaunchResult } from '../environment';
import type { ReviewThreadRecord } from '../review/types';

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

export async function tuicrAvailable(): Promise<boolean> {
  return Boolean(await findExecutable('tuicr'));
}

export async function listSessions(repo = '.'): Promise<SessionSummary[]> {
  await requireTuicr();
  const result = await run('tuicr', ['review', 'list', '--repo', repo]);
  if (result.code !== 0 || !result.stdout.trim()) return [];
  try {
    const raw = JSON.parse(result.stdout) as Array<{
      slug: string;
      kind: string;
      path: string;
      updated_at: string;
      comment_count: number;
      anchor: string;
      active: boolean;
    }>;
    return raw.map((entry) => ({
      slug: entry.slug,
      kind: entry.kind,
      path: entry.path,
      updatedAt: entry.updated_at,
      commentCount: entry.comment_count,
      anchor: entry.anchor,
      active: entry.active,
    }));
  } catch {
    throw new Error('Cannot parse tuicr review list output.');
  }
}

export async function addComment(
  session: string,
  body: string,
  opts: { targetFile?: string; line?: number; side?: 'old' | 'new'; username?: string } = {},
): Promise<void> {
  await requireTuicr();
  const args = ['review', 'add', '--session', session, body];
  if (opts.targetFile) args.push('--target-file', opts.targetFile);
  if (opts.line !== undefined) args.push('--line', String(opts.line));
  if (opts.side) args.push('--side', opts.side);
  if (opts.username) args.push('--username', opts.username);
  await runChecked('tuicr', args);
}

export async function launch(cwd: string, pr?: number | string, localBase?: string): Promise<LaunchResult> {
  let command: string[];
  if (pr !== undefined) command = ['tuicr', 'pr', String(pr)];
  else if (localBase) command = ['tuicr', '-w', '-r', `${localBase}..HEAD`];
  else throw new Error('Cannot launch a local tuicr review: no base branch could be determined.');
  if (!(await tuicrAvailable())) {
    return {
      launched: false,
      via: 'print',
      command: command.join(' '),
      reason: 'tuicr is not installed or is not available on PATH.',
      instruction: `Install tuicr, then run: ${command.join(' ')}`,
    };
  }
  const name = diffpiLaunchName(cwd, pr === undefined ? 'local review' : `PR #${pr}`);
  return openInNewTab(command, { cwd, name });
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

/** Resolve the matching PR draft when publishing remotely, or a local draft otherwise. */
export async function resolvePublishSession(
  cwd: string,
  target: { branch: string; owner?: string; repo?: string; number?: number },
): Promise<SessionSummary | undefined> {
  if (target.owner && target.repo && target.number !== undefined)
    return resolvePrSession(cwd, target.owner, target.repo, target.number);
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

// Utils -----------------------------------------------------------------------

async function requireTuicr(): Promise<void> {
  if (!(await tuicrAvailable())) throw new Error('tuicr is not installed or is not available on PATH.');
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
