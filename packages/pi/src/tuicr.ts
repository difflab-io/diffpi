import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ForgeProvider } from './environment';
import { openInNewTab, type LaunchResult } from './environment';
import type { ReviewComment } from './forge';
import { run, runChecked } from './process';
import { gitToplevel } from './store';

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
  content: string;
  side?: 'old' | 'new' | null;
}

interface SessionFileJson {
  file_comments?: SessionCommentJson[];
  line_comments?: Record<string, SessionCommentJson[]>;
}

export interface SessionJson {
  branch_name?: string;
  repo_path?: string;
  review_comments?: SessionCommentJson[];
  files?: Record<string, SessionFileJson>;
}

export async function tuicrAvailable(): Promise<boolean> {
  return (await run('tuicr', ['--version'])).code === 0;
}

export async function listSessions(repo = '.'): Promise<SessionSummary[]> {
  const result = await run('tuicr', ['review', 'list', '--repo', repo]);
  if (result.code !== 0 || !result.stdout.trim()) return [];
  let raw: Array<{
    slug: string;
    kind: string;
    path: string;
    updated_at: string;
    comment_count: number;
    anchor: string;
    active: boolean;
  }>;
  try {
    raw = JSON.parse(result.stdout) as typeof raw;
  } catch {
    return [];
  }
  return raw.map((entry) => ({
    slug: entry.slug,
    kind: entry.kind,
    path: entry.path,
    updatedAt: entry.updated_at,
    commentCount: entry.comment_count,
    anchor: entry.anchor,
    active: entry.active,
  }));
}

export async function resolveSession(cwd: string, branch: string): Promise<SessionSummary | undefined> {
  return findMatchingSession(await listSessions(cwd), cwd, branch);
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

export async function addComment(
  session: string,
  body: string,
  opts: { targetFile?: string; line?: number; username?: string } = {},
): Promise<void> {
  const args = ['review', 'add', '--session', session, body];
  if (opts.targetFile) args.push('--target-file', opts.targetFile);
  if (opts.line !== undefined) args.push('--line', String(opts.line));
  if (opts.username) args.push('--username', opts.username);
  await runChecked('tuicr', args);
}

export async function launch(cwd: string): Promise<LaunchResult> {
  return openInNewTab(['tuicr', '-w'], { cwd, name: 'tuicr' });
}

export function toFindings(session: SessionJson): { comments: ReviewComment[]; body: string } {
  const comments: ReviewComment[] = [];
  const bodyParts = (session.review_comments ?? []).map((comment) => comment.content);
  for (const [file, entry] of Object.entries(session.files ?? {})) {
    const fileComments = (entry.file_comments ?? []).map((comment) => comment.content);
    if (fileComments.length > 0) bodyParts.push(`File: ${file}\n\n${fileComments.join('\n\n')}`);
    for (const [lineKey, lineComments] of Object.entries(entry.line_comments ?? {})) {
      const line = Number.parseInt(lineKey, 10);
      if (!Number.isFinite(line)) continue;
      for (const lineComment of lineComments) {
        comments.push({ file, line, side: lineComment.side === 'old' ? 'LEFT' : 'RIGHT', body: lineComment.content });
      }
    }
  }
  return {
    comments,
    body: bodyParts.join('\n\n'),
  };
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

export type { ForgeProvider };
