/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { watchCiSnapshots } from '../../src/tools/plan-ci';

function runtime() {
  let timestamp = 0;
  return {
    now: () => timestamp,
    wait: async (milliseconds: number) => {
      timestamp += milliseconds;
    },
  };
}

describe('watchCiSnapshots', () => {
  it('waits through delayed check registration instead of accepting the first green check', async () => {
    const outputs = [
      ...Array.from({ length: 6 }, () => 'pass: lint'),
      'pass: lint\npending: test',
      'pass: lint\nfail: test',
    ];
    let index = 0;
    const settled = await watchCiSnapshots(
      {
        sha: 'a'.repeat(40),
        timeoutSeconds: 120,
        pollSeconds: 10,
        loadChecks: async () => outputs[Math.min(index++, outputs.length - 1)]!,
      },
      runtime(),
    );
    expect(settled.status).toBe('failed');
  });

  it('requires a stable green snapshot for the quiet period', async () => {
    let polls = 0;
    const settled = await watchCiSnapshots(
      {
        sha: 'b'.repeat(40),
        timeoutSeconds: 120,
        pollSeconds: 10,
        loadChecks: async () => ((polls += 1), 'pass: lint\npass: test'),
      },
      runtime(),
    );
    expect(settled.status).toBe('passed');
    expect(polls).toBeGreaterThanOrEqual(7);
  });

  it('waits until the configured timeout before skipping absent checks', async () => {
    let polls = 0;
    const settled = await watchCiSnapshots(
      {
        sha: 'c'.repeat(40),
        timeoutSeconds: 70,
        pollSeconds: 10,
        loadChecks: async () => ((polls += 1), ''),
      },
      runtime(),
    );
    expect(settled.status).toBe('skipped');
    expect(polls).toBeGreaterThan(6);
  });
});
