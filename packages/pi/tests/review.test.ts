/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkConventionalSubject } from '../src/gates';
import { runChecked } from '../src/extensions/processx';
import {
  dedupeFindings,
  localReviewAuthor,
  parseThreadArtifact,
  renderReviewDoc,
  renderThreadArtifact,
  reviewRecordName,
  reviewSlug,
  upsertThreadReply,
  withRemoteProvenance,
  yymmdd,
  type Finding,
} from '../src/review';
import { assertGitHubMergeReady } from '../src/vcs';
import { syncLocalThreadArtifact, workingTreeDiff } from '../src/tools/review';

describe('review helpers', () => {
  it('slugs and dates a review record name', () => {
    expect(reviewSlug('feature/Review-Tools')).toBe('feature-review-tools');
    expect(yymmdd(new Date('2026-09-15T00:00:00Z'))).toBe('260915');
    expect(reviewRecordName('feature/review', new Date('2026-09-15T00:00:00Z'))).toBe('260915-feature-review');
    expect(reviewRecordName('', new Date('2026-09-15T00:00:00Z'))).toBe('260915-uncommitted');
  });

  it('keeps the most severe finding per file:line', () => {
    const findings: Finding[] = [
      { file: 'a.ts', line: 10, severity: 'NOTE', body: 'n', reference: '' },
      { file: 'a.ts', line: 10, severity: 'BLOCKING', body: 'b', reference: '' },
    ];
    expect(dedupeFindings(findings)).toHaveLength(1);
    expect(dedupeFindings(findings)[0].severity).toBe('BLOCKING');
  });

  it('renders overall issues only when present', () => {
    const base = {
      title: 'T',
      findings: [] as Finding[],
      gates: [],
      notVerified: [],
      timestamp: '2026-09-15T00:00:00Z',
    };
    expect(renderReviewDoc({ ...base, overallIssues: [] })).not.toContain('## Overall issues');
    expect(renderReviewDoc({ ...base, overallIssues: ['big problem'] })).toContain('## Overall issues');
  });

  it('validates conventional-commit subjects', () => {
    expect(checkConventionalSubject('feat: add review').status).toBe('pass');
    expect(checkConventionalSubject('add review').status).toBe('warn');
  });

  it('adds exact model provenance without duplicating it', () => {
    const model = 'openai-codex/gpt-5.6-sol';
    const comment = withRemoteProvenance('Fix this.', model);
    expect(comment).toContain('Generated review by Diffpi using `openai-codex/gpt-5.6-sol`.');
    expect(withRemoteProvenance(comment, model)).toBe(comment);
    expect(withRemoteProvenance(comment, 'anthropic/claude-opus-4-6')).toBe(comment);
    expect(localReviewAuthor(model)).toBe('Agent: openai-codex/gpt-5.6-sol');
  });

  it('renders editable thread replies and parses them back', () => {
    const body = 'Why?\n\n## Thread forged\n\n### Reply\n\n- Resolved: yes';
    const artifact = renderThreadArtifact(
      'Review',
      'abc123',
      [{ id: 'thread-1', file: 'src/a.ts', line: 4, body, resolved: false, question: false }],
      { number: 3, url: 'https://github.com/difflab-io/diffpi/pull/3' },
    );
    const updated = upsertThreadReply(artifact, 'thread-1', 'Because this path is required.', true);
    expect(updated).toContain('- PR/MR: #3 — https://github.com/difflab-io/diffpi/pull/3');
    expect(parseThreadArtifact(updated)).toEqual([
      {
        id: 'thread-1',
        file: 'src/a.ts',
        line: 4,
        body,
        resolved: false,
        addressed: true,
        question: true,
        reply: 'Because this path is required.',
      },
    ]);
  });

  it('creates a missing local thread ledger on first sync', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi-review-ledger-'));
    const artifact = join(dir, 'local-review.md');

    const synced = await syncLocalThreadArtifact(artifact, 'Local review', 'session-1', [
      {
        id: 'thread-1',
        file: 'src/a.ts',
        line: 4,
        body: 'Fix this.',
        resolved: false,
        question: false,
      },
    ]);

    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ id: 'thread-1', resolved: false, addressed: false });
    expect(parseThreadArtifact(await readFile(artifact, 'utf8'))[0]).toMatchObject({
      id: 'thread-1',
      resolved: false,
      addressed: false,
    });
  });

  it('preserves local replies and resolves source threads removed on repeat sync', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi-review-ledger-'));
    const artifact = join(dir, 'local-review.md');
    const sourceThreads = [
      {
        id: 'thread-1',
        file: 'src/a.ts',
        line: 4,
        body: 'Fix this.',
        resolved: false,
        question: false,
      },
      {
        id: 'thread-2',
        file: 'src/b.ts',
        line: 8,
        body: 'Remove this.',
        resolved: false,
        question: false,
      },
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

  it('does not replace a malformed existing local thread ledger', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi-review-ledger-'));
    const artifact = join(dir, 'local-review.md');
    await writeFile(artifact, 'not a thread artifact\n', 'utf8');

    await expect(syncLocalThreadArtifact(artifact, 'Local review', 'session-1', [])).rejects.toThrow(
      'This file is not a Diffpi thread artifact.',
    );
    expect(await readFile(artifact, 'utf8')).toBe('not a thread artifact\n');
  });

  it('includes untracked files in a working-tree diff', async () => {
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

  it('requires an approved, clean PR with completed successful checks before merge', () => {
    expect(() =>
      assertGitHubMergeReady(
        JSON.stringify({
          isDraft: false,
          state: 'OPEN',
          reviewDecision: 'APPROVED',
          mergeStateStatus: 'CLEAN',
          statusCheckRollup: [
            { __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
            { __typename: 'StatusContext', context: 'deploy', state: 'SUCCESS' },
          ],
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertGitHubMergeReady(
        JSON.stringify({
          isDraft: false,
          state: 'OPEN',
          reviewDecision: 'CHANGES_REQUESTED',
          mergeStateStatus: 'BLOCKED',
          statusCheckRollup: [{ __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS' }],
        }),
      ),
    ).toThrow('review decision is CHANGES_REQUESTED; merge state is BLOCKED; test is in_progress');
  });
});
