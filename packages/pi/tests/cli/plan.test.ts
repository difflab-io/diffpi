/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { createPlanCliCommand } from '../../src/cli/plan';
import type { PlanRecord } from '../../src/plan';

function output() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (value: string) => ((stdout += value), true) },
      stderr: { write: (value: string) => ((stderr += value), true) },
    },
    read: () => ({ stdout, stderr }),
  };
}

const record = {
  id: '260919-demo',
  dir: '/tmp/demo',
  planPath: '/tmp/demo/PLAN.md',
  logPath: '/tmp/demo/logs.txt',
  source: '# Demo',
  document: {},
} as PlanRecord;

function controller() {
  return {
    context: async () => ({ candidates: [record], record, ambiguous: false }),
    createPlanReview: async () => ({ code: 0, review: { path: '/tmp/demo/reviews/1.json' } }),
  } as never;
}

describe('plan CLI', () => {
  it('reports the saved review dump with a real newline', async () => {
    const capture = output();
    await createPlanCliCommand(capture.io, controller()).parseAsync([
      'node',
      'plan',
      'annotate',
      'demo',
      '--cwd',
      '/tmp',
    ]);
    expect(capture.read().stdout).toBe('Saved review for 260919-demo to /tmp/demo/reviews/1.json.\n');
  });
});
