/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChecked } from '../../src/extensions/processx';
import { parseThreadArtifact, upsertThreadReply } from '../../src/review';
import {
  hasReviewDraft,
  partitionReviewComments,
  resolveReviewThread,
  syncLocalThreadArtifact,
  workingTreeDiff,
} from '../../src/tools/review';

describe('hasReviewDraft', () => {
  it('includes reviews that contain only an overall issue', () => {
    expect(hasReviewDraft([], 'Overall blocking issue.')).toBe(true);
    expect(hasReviewDraft([], '  ')).toBe(false);
  });
});

describe('partitionReviewComments', () => {
  it('removes checkpointed standalone comments before retry thread matching', () => {
    const comment = {
      file: 'src/a.ts',
      line: 4,
      body: 'Finding.',
      author: 'Agent: openai-codex/gpt-5.6-sol',
    };
    const first = partitionReviewComments([comment], new Set(), 'openai-codex/gpt-5.6-sol');
    const retry = partitionReviewComments(
      [comment],
      new Set(first.candidates.map((candidate) => candidate.fingerprint)),
      'openai-codex/gpt-5.6-sol',
    );
    expect(retry.candidates).toEqual([]);
    expect(retry.checkpointed).toHaveLength(1);
  });
});

describe('resolveReviewThread', () => {
  const threads = [
    {
      id: 'thread-1',
      file: 'src/a.ts',
      line: 4,
      rootCommentId: 'node-1',
      commentIds: ['node-1', '101'],
      body: 'Generated review by Diffpi using `model`.',
      resolved: false,
      question: false,
    },
    {
      id: 'thread-2',
      file: 'src/a.ts',
      line: 4,
      rootCommentId: 'node-2',
      commentIds: ['node-2', '102'],
      body: 'Second.',
      resolved: false,
      question: false,
    },
  ];

  it('prefers explicit source identity over an ambiguous location', () => {
    expect(
      resolveReviewThread({ file: 'src/a.ts', line: 4, body: 'Reply.', sourceCommentId: '102' }, threads)?.id,
    ).toBe('thread-2');
  });

  it('rejects ambiguous location-only matches', () => {
    expect(() => resolveReviewThread({ file: 'src/a.ts', line: 4, body: 'Reply.' }, threads)).toThrow(
      'Ambiguous remote review threads',
    );
  });

  it('matches file-level and agent-authored threads', () => {
    expect(
      resolveReviewThread({ file: 'src/file.ts', body: 'Reply.' }, [
        {
          id: 'file-thread',
          file: 'src/file.ts',
          body: 'Generated review by Diffpi using `model`.',
          resolved: false,
          question: false,
        },
      ])?.id,
    ).toBe('file-thread');
  });
});

describe('syncLocalThreadArtifact', () => {
  it('creates a missing local thread ledger on first sync', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi-review-ledger-'));
    const artifact = join(dir, 'local-review.md');
    const synced = await syncLocalThreadArtifact(artifact, 'Local review', 'session-1', [
      { id: 'thread-1', file: 'src/a.ts', line: 4, body: 'Fix this.', resolved: false, question: false },
    ]);
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ id: 'thread-1', resolved: false, addressed: false });
    expect(parseThreadArtifact(await readFile(artifact, 'utf8'))[0]).toMatchObject({
      id: 'thread-1',
      resolved: false,
      addressed: false,
    });
  });

  it('preserves replies and resolves source threads removed on repeat sync', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi-review-ledger-'));
    const artifact = join(dir, 'local-review.md');
    const sourceThreads = [
      { id: 'thread-1', file: 'src/a.ts', line: 4, body: 'Fix this.', resolved: false, question: false },
      { id: 'thread-2', file: 'src/b.ts', line: 8, body: 'Remove this.', resolved: false, question: false },
    ];
    await syncLocalThreadArtifact(artifact, 'Local review', 'session-1', sourceThreads);
    await writeFile(artifact, upsertThreadReply(await readFile(artifact, 'utf8'), 'thread-1', 'Fixed.'), 'utf8');
    const synced = await syncLocalThreadArtifact(artifact, 'Local review', 'session-1', [sourceThreads[0]]);
    expect(synced.find((thread) => thread.id === 'thread-1')).toMatchObject({
      resolved: false,
      addressed: true,
      reply: 'Fixed.',
    });
    expect(synced.find((thread) => thread.id === 'thread-2')).toMatchObject({ resolved: true });
    expect(parseThreadArtifact(await readFile(artifact, 'utf8'))).toEqual(synced);
  });

  it('does not replace a malformed existing ledger', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi-review-ledger-'));
    const artifact = join(dir, 'local-review.md');
    await writeFile(artifact, 'not a thread artifact\n', 'utf8');
    await expect(syncLocalThreadArtifact(artifact, 'Local review', 'session-1', [])).rejects.toThrow(
      'This file is not a Diffpi thread artifact.',
    );
    expect(await readFile(artifact, 'utf8')).toBe('not a thread artifact\n');
  });
});

describe('workingTreeDiff', () => {
  it('includes untracked files', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'diffpi-review-diff-'));
    await runChecked('git', ['-C', repo, 'init', '-q']);
    await writeFile(join(repo, 'tracked.txt'), 'tracked\n');
    await runChecked('git', ['-C', repo, 'add', 'tracked.txt']);
    await runChecked('git', [
      '-C',
      repo,
      '-c',
      'user.name=Diffpi Test',
      '-c',
      'user.email=diffpi@example.invalid',
      'commit',
      '-qm',
      'test: initial',
    ]);
    await writeFile(join(repo, 'new.txt'), 'untracked content\n');
    const diff = await workingTreeDiff(repo);
    expect(diff).toContain('new.txt');
    expect(diff).toContain('+untracked content');
  });
});
