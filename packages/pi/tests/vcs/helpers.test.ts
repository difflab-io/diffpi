/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { isConfirmedMissingChange } from '../../src/vcs';

describe('isConfirmedMissingChange', () => {
  it('recognizes only confirmed missing PR/MR errors', () => {
    expect(isConfirmedMissingChange('github', 'no pull requests found for branch "missing"')).toBe(true);
    expect(isConfirmedMissingChange('gitlab', 'failed to get open merge request: 404 Not Found')).toBe(true);
    expect(isConfirmedMissingChange('github', 'HTTP 401: Bad credentials')).toBe(false);
    expect(isConfirmedMissingChange('gitlab', 'invalid character in JSON')).toBe(false);
  });
});
