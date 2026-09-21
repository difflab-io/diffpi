/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { createForgeBackend } from '../../src/vcs';
import { assertGitHubMergeReady } from '../../src/vcs/github';
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
