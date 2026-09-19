import { openInNewTab, type LaunchResult } from '../environment';
import { run, runChecked } from './processx';
import type { SessionSummary } from '../tuicr';

/** Process boundary for tuicr. Session matching and comment transformations stay in ../tuicr. */
export async function tuicrAvailable(): Promise<boolean> {
  return (await run('tuicr', ['--version'])).code === 0;
}

export async function listSessions(repo = '.'): Promise<SessionSummary[]> {
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
    return [];
  }
}

export async function addComment(
  session: string,
  body: string,
  opts: { targetFile?: string; line?: number; side?: 'old' | 'new'; username?: string } = {},
): Promise<void> {
  const args = ['review', 'add', '--session', session, body];
  if (opts.targetFile) args.push('--target-file', opts.targetFile);
  if (opts.line !== undefined) args.push('--line', String(opts.line));
  if (opts.side) args.push('--side', opts.side);
  if (opts.username) args.push('--username', opts.username);
  await runChecked('tuicr', args);
}

export function launch(cwd: string, pr?: number | string): Promise<LaunchResult> {
  return openInNewTab(pr === undefined ? ['tuicr', '-w'] : ['tuicr', 'pr', String(pr)], { cwd, name: 'tuicr' });
}
