/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VcsInfo } from '../../src/environment';
import { runChecked } from '../../src/extensions/processx';
import {
  loadReviewPublicationState,
  parseReviewThreadAction,
  reviewBodyFingerprint,
  reviewCommentFingerprint,
  reviewReplyFingerprint,
  saveReviewPublicationState,
  unpublishedReviewComments,
} from '../../src/review';
import type { ReviewComment } from '../../src/review';

describe('review publication state', () => {
  const comments: ReviewComment[] = [
    { file: 'src/a.ts', line: 3, side: 'RIGHT', body: 'First.' },
    { file: 'src/b.ts', line: 8, side: 'LEFT', body: 'Second.' },
  ];

  it('parses thread actions without losing response text', () => {
    expect(parseReviewThreadAction('[REOPEN] Please revisit this.')).toEqual({
      action: 'reopen',
      body: 'Please revisit this.',
    });
    expect(parseReviewThreadAction('[RESOLVE]')).toEqual({ action: 'resolve', body: '' });
    expect(parseReviewThreadAction('[DELETE] Remove this thread.')).toEqual({
      action: 'delete',
      body: 'Remove this thread.',
    });
    expect(parseReviewThreadAction('A normal response.')).toEqual({ body: 'A normal response.' });
  });

  it('skips every comment after a successful publication', () => {
    const known = new Set(comments.map(reviewCommentFingerprint));
    expect(unpublishedReviewComments(comments, known)).toEqual([]);
  });

  it('retries only comments absent from a partially staged draft', () => {
    const known = new Set([reviewCommentFingerprint(comments[0])]);
    expect(unpublishedReviewComments(comments, known)).toEqual([comments[1]]);
  });

  it('keeps the reply overlay pointer stable when the PR head changes', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-publication-'));
    const repo = join(base, 'repo');
    const home = join(base, 'home');
    await mkdir(repo);
    await runChecked('git', ['-C', repo, 'init', '-q']);
    await runChecked('git', ['-C', repo, 'remote', 'add', 'origin', 'https://github.com/difflab-io/diffpi.git']);
    const vcs: VcsInfo = {
      provider: 'github',
      host: 'github.com',
      owner: 'difflab-io',
      repo: 'diffpi',
      branch: 'feature/review',
      root: repo,
    };
    const publication = await loadReviewPublicationState(repo, vcs, 3, home);
    publication.state.overlayPath = join(repo, '.diffpi', 'reviews', '260915-oldsha.md');
    await saveReviewPublicationState(publication.path, publication.state);
    const reloaded = await loadReviewPublicationState(repo, vcs, 3, home);
    expect(reloaded.state.overlayPath).toBe(publication.state.overlayPath);
    expect(reloaded.path).toBe(publication.path);
  });

  it('uses body content for review-level publication idempotency', () => {
    expect(reviewBodyFingerprint('Overall issue.')).toBe(reviewBodyFingerprint('Overall issue.'));
    expect(reviewBodyFingerprint('Overall issue.')).not.toBe(reviewBodyFingerprint('Different issue.'));
  });

  it('uses thread and body together for reply idempotency', () => {
    expect(reviewReplyFingerprint('thread-1', 'Done.')).toBe(reviewReplyFingerprint('thread-1', 'Done.'));
    expect(reviewReplyFingerprint('thread-1', 'Done.')).not.toBe(reviewReplyFingerprint('thread-2', 'Done.'));
  });
});
