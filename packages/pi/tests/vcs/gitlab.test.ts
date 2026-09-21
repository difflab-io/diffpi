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
});
