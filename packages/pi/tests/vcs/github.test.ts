/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { createForgeBackend } from '../../src/vcs';
import { assertGitHubMergeReady, formatGitHubCommitChecks } from '../../src/vcs/github';
import type { VcsInfo } from '../../src/environment';

describe('assertGitHubMergeReady', () => {
  it('accepts an approved, clean PR with successful checks', () => {
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
  });

  it('reports every merge blocker', () => {
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

describe('formatGitHubCommitChecks', () => {
  it('normalizes checks for one exact commit', () => {
    expect(
      formatGitHubCommitChecks(
        JSON.stringify({
          check_runs: [
            { name: 'test', status: 'completed', conclusion: 'success' },
            { name: 'lint', status: 'in_progress', conclusion: null },
          ],
        }),
        JSON.stringify({ statuses: [{ context: 'deploy', state: 'failure' }] }),
      ),
    ).toBe('pass: test\npending: lint\nfail: deploy');
    expect(formatGitHubCommitChecks('{"check_runs":[]}', '{"statuses":[]}')).toBe('');
  });
});

describe('createForgeBackend', () => {
  it('rejects unsupported remotes instead of silently selecting local review', () => {
    const vcs: VcsInfo = {
      provider: 'none',
      host: 'code.example.com',
      owner: 'example',
      repo: 'project',
      branch: 'feature/review',
      root: '/tmp/project',
    };
    expect(() => createForgeBackend(vcs)).toThrow('No supported forge detected');
  });
});
