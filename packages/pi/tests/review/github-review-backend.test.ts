/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitHubReviewBackend } from '../../src/review/github-review-backend';
import { githubVcs, withFakeCommand } from '../fixtures/forge';

describe('GitHubReviewBackend', () => {
  it('normalizes file-level locations and preserves both comment ID forms', async () => {
    await withFakeCommand(
      'gh',
      `process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [{ id: 'thread-file', isResolved: false, path: 'src/a.ts', line: null, comments: { nodes: [{ id: 'node-comment', databaseId: 42, body: 'File note.' }] } }], pageInfo: { hasNextPage: false, endCursor: null } } } } } }));`,
      async () => {
        const threads = await GitHubReviewBackend(githubVcs, 7).listThreads();
        expect(threads[0]).toMatchObject({
          id: 'thread-file',
          file: 'src/a.ts',
          line: undefined,
          commentIds: ['node-comment', '42'],
          commentNodeIds: ['node-comment'],
        });
      },
    );
  });

  it('uses only GraphQL node IDs when deleting thread comments', async () => {
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-gh-delete-log-')), 'calls.jsonl');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'gh',
        `import { appendFileSync } from 'node:fs';
const args = Bun.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args.some((arg) => arg.includes('reviewThreads'))) process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [{ id: 'thread-file', isResolved: false, path: 'src/a.ts', line: null, comments: { nodes: [{ id: 'node-comment', databaseId: 42, body: 'File note.' }] } }], pageInfo: { hasNextPage: false, endCursor: null } } } } } }));`,
        async () => GitHubReviewBackend(githubVcs, 7).deleteThread('thread-file'),
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    const deleteCalls = calls.filter((args) => args.some((arg) => arg.includes('deletePullRequestReviewComment')));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]).toContain('commentId=node-comment');
    expect(deleteCalls[0]).not.toContain('commentId=42');
  });

  it('publishes file-only change requests with a fallback body', async () => {
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-gh-request-log-')), 'calls.jsonl');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'gh',
        `import { appendFileSync } from 'node:fs';
const args = Bun.argv.slice(2);
if (args.includes('--jq')) process.stdout.write('');
else appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');`,
        async () => GitHubReviewBackend(githubVcs, 7).publish('REQUEST_CHANGES'),
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    const args = JSON.parse((await readFile(log, 'utf8')).trim()) as string[];
    expect(args).toContain('event=REQUEST_CHANGES');
    expect(args).toContain('body=Changes requested in file-level review comments.');
    expect(args.some((arg) => arg.endsWith('/pulls/7/reviews'))).toBe(true);
  });
});
