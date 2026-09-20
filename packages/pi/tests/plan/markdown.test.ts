/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { countDesignWords, parsePlanDocument, renderPlanDocument, validatePlanDocument } from '../../src/plan';
import type { PlanDocument } from '../../src/plan';

function plan(): PlanDocument {
  return {
    schemaVersion: 1,
    id: '260919-demo',
    revision: 0,
    title: 'Demo',
    branch: 'feature/demo',
    intent: 'Ship the demo.',
    requirements: ['Keep markers stable.'],
    design: { bigIdeas: 'Use Markdown.', keyApiUpdates: 'Add plan tools.', consequences: 'Markers are public.' },
    phases: [
      {
        id: 'phase-one',
        revision: 0,
        title: 'First',
        objective: 'Build it.',
        dependencies: [],
        status: 'pending',
        gate: { phaseRevision: 0, status: 'pending', results: [] },
        tasks: [
          {
            id: 'task-one',
            revision: 0,
            title: 'Implement',
            steps: ['Edit code'],
            dependencies: [],
            fileScopes: ['src/**'],
            acceptanceCriteria: ['Tests pass'],
            status: 'pending',
          },
        ],
      },
    ],
    references: [{ id: 'source', value: 'src/index.ts' }],
    status: 'draft',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  };
}

describe('plan Markdown', () => {
  it('round trips managed content and preserves prose during status changes', () => {
    const source = renderPlanDocument(plan()).replace('Ship the demo.', 'Ship the carefully edited demo.');
    const parsed = parsePlanDocument(source);
    const updated = { ...parsed, revision: 1, status: 'ready' as const };
    const rendered = renderPlanDocument(updated, source);
    expect(rendered).toContain('Ship the carefully edited demo.');
    expect(parsePlanDocument(rendered).status).toBe('ready');
  });

  it('reports strict completeness and Design limits', () => {
    const value = plan();
    value.design.bigIdeas = Array.from({ length: 301 }, () => 'word').join(' ');
    expect(countDesignWords(value)).toBeGreaterThan(300);
    expect(validatePlanDocument(value, { strict: true }).map((issue) => issue.code)).toContain('design-length');
  });

  it('rejects duplicate stable task markers', () => {
    const value = plan();
    value.phases[0]!.tasks.push({ ...value.phases[0]!.tasks[0]! });
    expect(() => parsePlanDocument(renderPlanDocument(value))).toThrow('Duplicate task id');
  });
});
