/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { formatGitLabCommitChecks } from '../../src/vcs/gitlab';

describe('formatGitLabCommitChecks', () => {
  it('normalizes statuses for one exact commit', () => {
    expect(
      formatGitLabCommitChecks(
        JSON.stringify([
          { name: 'test', status: 'success' },
          { name: 'lint', status: 'running' },
          { name: 'deploy', status: 'failed' },
        ]),
      ),
    ).toBe('pass: test\npending: lint\nfail: deploy');
    expect(formatGitLabCommitChecks('[]')).toBe('');
  });

  it('uses the newest result for rerun job identities', () => {
    expect(
      formatGitLabCommitChecks(
        JSON.stringify([
          { name: 'test', status: 'success' },
          { name: 'test', status: 'failed' },
        ]),
      ),
    ).toBe('pass: test');
  });
});
