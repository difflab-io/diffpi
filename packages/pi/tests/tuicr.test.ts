/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { run } from '../src/process';
import { findMatchingSession, resolveReviewSession, toFindings, type SessionSummary } from '../src/tuicr';

async function withFakeTuicr<T>(sessions: SessionSummary[], callback: () => Promise<T>): Promise<T> {
  const bin = await mkdtemp(join(tmpdir(), 'diffpi-tuicr-bin-'));
  const executable = join(bin, 'tuicr');
  await writeFile(
    executable,
    `#!${process.execPath}\nprocess.stdout.write(process.env.FAKE_TUICR_SESSIONS ?? '[]');\n`,
  );
  await chmod(executable, 0o755);
  const previousPath = process.env.PATH;
  const previousSessions = process.env.FAKE_TUICR_SESSIONS;
  process.env.PATH = `${bin}${delimiter}${previousPath ?? ''}`;
  process.env.FAKE_TUICR_SESSIONS = JSON.stringify(
    sessions.map((session) => ({
      slug: session.slug,
      kind: session.kind,
      path: session.path,
      updated_at: session.updatedAt,
      comment_count: session.commentCount,
      anchor: session.anchor,
      active: session.active,
    })),
  );
  try {
    return await callback();
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousSessions === undefined) delete process.env.FAKE_TUICR_SESSIONS;
    else process.env.FAKE_TUICR_SESSIONS = previousSessions;
  }
}

describe('tuicr toFindings', () => {
  it('maps line, file, and review comments to the forge shape', () => {
    const session = {
      branch_name: 'feature/review',
      review_comments: [{ content: 'Overall: looks good.' }],
      files: {
        'src/foo.ts': {
          file_comments: [{ content: 'Remove this file.', side: null }],
          line_comments: {
            '42': [{ content: 'Validate this input.', side: 'new' as const }],
            '7': [{ content: 'This was here before.', side: 'old' as const }],
          },
        },
      },
    };
    const { comments, body } = toFindings(session);
    expect(body).toBe('Overall: looks good.\n\nFile: src/foo.ts\n\nRemove this file.');
    expect(comments).toEqual(
      expect.arrayContaining([
        { file: 'src/foo.ts', line: 42, side: 'RIGHT', body: 'Validate this input.' },
        { file: 'src/foo.ts', line: 7, side: 'LEFT', body: 'This was here before.' },
      ]),
    );
    expect(comments).not.toContainEqual({ file: 'src/foo.ts', line: 1, side: 'RIGHT', body: 'Remove this file.' });
  });

  it('returns empty results for an empty session', () => {
    expect(toFindings({})).toEqual({ comments: [], body: '' });
  });

  it('promotes only agent-authored comments when requested', () => {
    const session = {
      files: {
        'src/foo.ts': {
          line_comments: {
            '3': [
              { content: 'Existing remote comment.', username: 'reviewer' },
              { content: 'Local generated comment.', username: 'Agent: openai-codex/gpt-5.6-sol' },
            ],
          },
        },
      },
    };
    expect(toFindings(session, { agentOnly: true }).comments).toEqual([
      {
        file: 'src/foo.ts',
        line: 3,
        side: 'RIGHT',
        body: 'Local generated comment.',
        author: 'Agent: openai-codex/gpt-5.6-sol',
      },
    ]);
  });

  it('forces the local session for working-tree review even when a PR session exists', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-tuicr-target-'));
    const repo = join(base, 'repo');
    await mkdir(repo);
    await run('git', ['-C', repo, 'init', '-q']);
    const localPath = join(base, 'local.json');
    await writeFile(localPath, JSON.stringify({ repo_path: repo, branch_name: 'feature/review' }));
    const sessions: SessionSummary[] = [
      {
        slug: 'gh:difflab-io/diffpi/pr/3',
        kind: 'pr',
        path: join(base, 'pr.json'),
        updatedAt: '',
        commentCount: 0,
        anchor: '3',
        active: false,
      },
      {
        slug: 'local',
        kind: 'local',
        path: localPath,
        updatedAt: '',
        commentCount: 0,
        anchor: 'feature/review',
        active: false,
      },
    ];

    await withFakeTuicr(sessions, async () => {
      expect(
        (
          await resolveReviewSession(repo, {
            branch: 'feature/review',
            workingTree: true,
            owner: 'difflab-io',
            repo: 'diffpi',
            number: 3,
          })
        )?.slug,
      ).toBe('local');
      expect(
        (
          await resolveReviewSession(repo, {
            branch: 'feature/review',
            owner: 'difflab-io',
            repo: 'diffpi',
            number: 3,
          })
        )?.slug,
      ).toBe('gh:difflab-io/diffpi/pr/3');
    });
  });

  it('selects only a session whose repository and branch both match', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-tuicr-'));
    const repo = join(base, 'repo');
    const otherRepo = join(base, 'other');
    await mkdir(repo);
    await mkdir(otherRepo);
    await run('git', ['-C', repo, 'init', '-q']);
    const wrongBranchPath = join(base, 'wrong-branch.json');
    const wrongRepoPath = join(base, 'wrong-repo.json');
    const matchingPath = join(base, 'matching.json');
    await writeFile(wrongBranchPath, JSON.stringify({ repo_path: repo, branch_name: 'feature/other' }));
    await writeFile(wrongRepoPath, JSON.stringify({ repo_path: otherRepo, branch_name: 'feature/review' }));
    await writeFile(matchingPath, JSON.stringify({ repo_path: repo, branch_name: 'feature/review' }));
    const summary = (path: string, slug: string): SessionSummary => ({
      slug,
      kind: 'local',
      path,
      updatedAt: '',
      commentCount: 0,
      anchor: 'feature/review',
      active: false,
    });
    const sessions = [
      summary(wrongBranchPath, 'wrong-branch'),
      summary(wrongRepoPath, 'wrong-repo'),
      summary(matchingPath, 'matching'),
    ];

    expect((await findMatchingSession(sessions, repo, 'feature/review'))?.slug).toBe('matching');
    expect(await findMatchingSession(sessions.slice(0, 2), repo, 'feature/review')).toBeUndefined();
  });
});
