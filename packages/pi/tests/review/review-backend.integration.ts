/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRemoteReviewBackend,
  githubReviewSubmissionEndpoint,
  hasGitlabDraftNotes,
  parseGitlabDiffRefs,
} from '../../src/review';
import { githubVcs, gitlabVcs, withFakeCommand } from '../fixtures/forge';

describe('ReviewBackend', () => {
  it('requires all GitLab diff refs for positioned draft notes', () => {
    expect(
      parseGitlabDiffRefs(JSON.stringify({ diff_refs: { base_sha: 'base', start_sha: 'start', head_sha: 'head' } })),
    ).toEqual({ base_sha: 'base', start_sha: 'start', head_sha: 'head' });
    expect(() => parseGitlabDiffRefs(JSON.stringify({ diff_refs: { head_sha: 'head' } }))).toThrow(
      'merge request diff refs are unavailable',
    );
  });

  it('detects whether GitLab has draft notes to publish', () => {
    expect(hasGitlabDraftNotes('[]')).toBe(false);
    expect(hasGitlabDraftNotes('[{"id":1}]')).toBe(true);
  });

  it('selects the correct GitHub review submission endpoint', () => {
    expect(githubReviewSubmissionEndpoint('difflab', 'pi', 12, '')).toBe('/repos/difflab/pi/pulls/12/reviews');
    expect(githubReviewSubmissionEndpoint('difflab', 'pi', 12, '34')).toBe(
      '/repos/difflab/pi/pulls/12/reviews/34/events',
    );
  });

  it('uses the GitHub node id when adding a thread to a pending review', async () => {
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-gh-log-')), 'calls.jsonl');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'gh',
        `import { appendFileSync } from 'node:fs';
const args = Bun.argv.slice(2);
if (args.includes('--jq')) process.stdout.write(JSON.stringify({ id: '34', nodeId: 'PRR_node' }));
else appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');`,
        async () => {
          await createRemoteReviewBackend(githubVcs, 7).stage({
            body: '',
            comments: [{ file: 'src/a.ts', line: 3, body: 'Fix this.' }],
          });
        },
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    expect(calls[0]).toContain('reviewId=PRR_node');
    expect(calls[0]).not.toContain('reviewId=34');
  });

  it('paginates GitHub review threads', async () => {
    await withFakeCommand(
      'gh',
      `const args = Bun.argv.slice(2);
const second = args.some((arg) => arg === 'after=cursor-1');
const node = { id: second ? 'thread-2' : 'thread-1', isResolved: false, path: 'src/a.ts', line: 3, comments: { nodes: [{ body: 'Question?' }] } };
process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [node], pageInfo: { hasNextPage: !second, endCursor: second ? null : 'cursor-1' } } } } } }));`,
      async () => {
        const threads = await createRemoteReviewBackend(githubVcs, 7).listThreads();
        expect(threads.map((thread) => thread.id)).toEqual(['thread-1', 'thread-2']);
      },
    );
  });

  it('paginates GitLab discussions and preserves deleted-line positions', async () => {
    await withFakeCommand(
      'glab',
      `const endpoint = Bun.argv.at(-1);
const page = endpoint.includes('page=2') ? 2 : 1;
const count = page === 1 ? 100 : 1;
process.stdout.write(JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: 'thread-' + page + '-' + index, resolved: false, notes: [{ body: 'Delete this.', position: { old_path: 'src/old.ts', old_line: 9 } }] }))));`,
      async () => {
        const threads = await createRemoteReviewBackend(gitlabVcs, 7).listThreads();
        expect(threads).toHaveLength(101);
        expect(threads[0]).toMatchObject({ file: 'src/old.ts', line: 9 });
      },
    );
  });

  it('creates a GitLab draft note for a review body without inline comments', async () => {
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-glab-log-')), 'calls.jsonl');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'glab',
        `import { appendFileSync } from 'node:fs';
const args = Bun.argv.slice(2);
const input = args.includes('--input') ? await Bun.stdin.text() : '';
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, input }) + '\\n');`,
        async () => {
          await createRemoteReviewBackend(gitlabVcs, 7).stage({ comments: [], body: 'Overall blocking issue.' });
        },
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].input)).toEqual({ note: 'Overall blocking issue.' });
    expect(calls[0].args.some((arg: string) => arg.endsWith('/draft_notes'))).toBe(true);
  });

  it('fails explicitly before an unsupported GitLab changes-request review', async () => {
    expect(createRemoteReviewBackend(gitlabVcs, 7).publish('REQUEST_CHANGES')).rejects.toThrow(
      'GitLab does not support REQUEST_CHANGES',
    );
  });
});
