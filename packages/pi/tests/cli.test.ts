/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { main } from '../src/cli';

function io() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (value: string) => ((stdout += value), true) },
      stderr: { write: (value: string) => ((stderr += value), true) },
    },
    output: () => ({ stdout, stderr }),
  };
}

describe('diffpi CLI', () => {
  it('uses one Commander root for top-level and plan help', async () => {
    const root = io();
    expect(await main(['--help'], root.io)).toBe(0);
    expect(root.output().stdout).toContain('diffpi');
    expect(root.output().stdout).toContain('plan');

    const plan = io();
    expect(await main(['plan', '--help'], plan.io)).toBe(0);
    expect(plan.output().stdout).toContain('Plan annotation commands');
    expect(plan.output().stdout).toContain('annotate');
  });
});
