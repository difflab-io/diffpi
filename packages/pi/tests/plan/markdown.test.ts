/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import {
  countDesignWords,
  parsePlanDocument,
  renderImplementationBrief,
  renderPlanDocument,
  validatePlanBriefs,
  validatePlanDocument,
} from '../../src/plan/markdown';
import type { PlanDocument, PlanImplementationBrief } from '../../src/plan';

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
            dependencies: [],
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

function brief(): PlanImplementationBrief {
  return {
    phaseId: 'phase-one',
    summary: 'Implement the first phase.',
    apiChanges: ['Add the plan API.'],
    libraries: [],
    constraints: ['Keep stable markers.'],
    tasks: [
      {
        taskId: 'task-one',
        steps: ['Run lint, tests, and build', 'Record results'],
        fileScopes: ['src/{foo,bar}.ts'],
        acceptanceCriteria: ['Format, lint, and tests pass'],
      },
    ],
  };
}

describe('plan Markdown', () => {
  it('round trips concise managed content and preserves prose during status changes', () => {
    const source = renderPlanDocument(plan()).replace('Ship the demo.', 'Ship the carefully edited demo.');
    const parsed = parsePlanDocument(source);
    const rendered = renderPlanDocument({ ...parsed, status: 'ready' }, source);

    expect(rendered).toContain('Ship the carefully edited demo.');
    expect(rendered).not.toContain('Ordered Steps');
    expect(rendered).not.toContain('File Scopes');
    expect(rendered).not.toContain('Acceptance Criteria');
    expect(parsePlanDocument(rendered).status).toBe('ready');
  });

  it('renders detailed task work only in an ordinal implementation brief', () => {
    const value = plan();
    const rendered = renderImplementationBrief(0, 1, value.phases[0]!, brief());

    expect(rendered).toContain('<!-- diffpi-implementation: {"schemaVersion":1,"planRevision":0,"ordinal":1');
    expect(rendered).toContain('- Run lint, tests, and build');
    expect(rendered).toContain('- src/{foo,bar}.ts');
    expect(rendered).toContain('- Format, lint, and tests pass');
  });

  it('reports strict placeholders, completeness, and Design limits', () => {
    const value = plan();
    value.design.bigIdeas = Array.from({ length: 301 }, () => 'word').join(' ');
    value.phases[0]!.tasks[0]!.title = 'TODO';
    const codes = validatePlanDocument(value, { strict: true }).map((issue) => issue.code);

    expect(countDesignWords(value)).toBeGreaterThan(300);
    expect(codes).toContain('design-length');
    expect(codes).toContain('placeholder');
  });

  it('requires brief phase and task IDs to match exactly in order', () => {
    const invalid = brief();
    invalid.tasks[0]!.taskId = 'another-task';
    expect(validatePlanBriefs(plan(), [invalid]).map((issue) => issue.code)).toContain('brief-task-ids');
  });

  it('rejects duplicate stable task markers', () => {
    const value = plan();
    value.phases[0]!.tasks.push({ ...value.phases[0]!.tasks[0]! });
    expect(() => parsePlanDocument(renderPlanDocument(value))).toThrow('Duplicate task id');
  });
});
