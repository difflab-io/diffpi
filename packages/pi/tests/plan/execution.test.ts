/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { parsePlannerEscalation, renderPlannerEscalation, tasksMayRunInParallel } from '../../src/plan';
import type { PlanTask, PlannerEscalation } from '../../src/plan';

const task = (id: string, scope: string): PlanTask => ({
  id,
  revision: 0,
  title: id,
  dependencies: [],
  fileScopes: [scope],
  acceptanceCriteria: ['done'],
  status: 'pending',
});

describe('plan execution helpers', () => {
  it('serializes overlapping or missing file scopes', () => {
    expect(tasksMayRunInParallel(task('one', 'src/a/**'), task('two', 'src/b/**'))).toBe(true);
    expect(tasksMayRunInParallel(task('one', 'src/**'), task('two', 'src/a.ts'))).toBe(false);
    expect(tasksMayRunInParallel(task('one', 'src/a.ts'), { ...task('two', 'src/b.ts'), fileScopes: [] })).toBe(false);
  });

  it('round trips validated escalation sentinels and rejects malformed output', () => {
    const value: PlannerEscalation = {
      planId: '260919-demo',
      executionId: 'run-1',
      phaseId: 'phase-one',
      taskId: 'task-one',
      blocker: 'Need an API choice.',
      attempts: ['A'],
      evidence: ['error'],
      needsUserDecision: true,
    };
    expect(parsePlannerEscalation(renderPlannerEscalation(value))).toEqual(value);
    expect(() => parsePlannerEscalation('no payload')).toThrow('Missing');
  });
});
