/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { run } from '../../src/extensions/processx';
import { findMatchingSession, launch, resolveReviewSession, type SessionSummary } from '../../src/extensions/tuicrx';

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

describe('tuicr session resolution', () => {
  it('forces a local session for working-tree review even when a PR session exists', async () => {
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

describe('launch', () => {
  it('returns an explicit installation fallback when tuicr is unavailable', async () => {
    const previousPath = process.env.PATH;
    process.env.PATH = '';
    try {
      expect(await launch('/tmp/project')).toMatchObject({
        launched: false,
        via: 'print',
        command: 'tuicr -w',
        reason: 'tuicr is not installed or is not available on PATH.',
        instruction: 'Install tuicr, then run: tuicr -w',
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });
});
