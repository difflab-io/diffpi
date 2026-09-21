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
    annotate: async () => ({ sessionSlug: 'demo/session', code: 0, state: {} }),
    annotations: async () => ({ comments: [], pending: [] }),
  } as never;
}

describe('plan CLI', () => {
  it('terminates annotation output with a real newline', async () => {
    const capture = output();
    await createPlanCliCommand(capture.io, controller()).parseAsync([
      'node',
      'plan',
      'annotate',
      'demo',
      '--cwd',
      '/tmp',
    ]);
    expect(capture.read().stdout).toBe('Annotated 260919-demo in tuicr session demo/session.\n');
  });

  it('emits parseable annotation JSON followed by whitespace', async () => {
    const capture = output();
    await createPlanCliCommand(capture.io, controller()).parseAsync([
      'node',
      'plan',
      'annotations',
      'demo',
      '--cwd',
      '/tmp',
    ]);
    expect(capture.read().stdout.endsWith('\n')).toBe(true);
    expect(JSON.parse(capture.read().stdout)).toEqual({ comments: [], pending: [] });
  });
});
