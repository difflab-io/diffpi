/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { countDesignWords, parsePlanDocument, renderPlanDocument, validatePlanDocument } from '../../src/plan/markdown';
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

  it('preserves commas in task prose through canonical and legacy formats', () => {
    const value = plan();
    const task = value.phases[0]!.tasks[0]!;
    task.steps = ['Run lint, tests, and build', 'Record results'];
    task.fileScopes = ['src/{foo,bar}.ts'];
    task.acceptanceCriteria = ['Format, lint, and tests pass', 'Output remains stable'];
    const rendered = renderPlanDocument(value);
    expect(rendered).toContain('    - Run lint, tests, and build');
    expect(parsePlanDocument(rendered).phases[0]?.tasks[0]).toMatchObject({
      steps: task.steps,
      fileScopes: task.fileScopes,
      acceptanceCriteria: task.acceptanceCriteria,
    });

    const legacy = rendered
      .replace('  - Steps:\n    - Run lint, tests, and build\n    - Record results', '  - Steps: Edit code, Run tests')
      .replace('  - File scopes:\n    - src/{foo,bar}.ts', '  - File scopes: src/**, tests/**')
      .replace(
        '  - Acceptance criteria:\n    - Format, lint, and tests pass\n    - Output remains stable',
        '  - Acceptance criteria: Tests pass, Lint passes',
      );
    expect(parsePlanDocument(legacy).phases[0]?.tasks[0]).toMatchObject({
      steps: ['Edit code', 'Run tests'],
      fileScopes: ['src/**', 'tests/**'],
      acceptanceCriteria: ['Tests pass', 'Lint passes'],
    });
  });

  it('preserves multiline task prose', () => {
    const value = plan();
    const task = value.phases[0]!.tasks[0]!;
    task.steps = ['Run checks\nand retain the full output'];
    task.fileScopes = ['src/first.ts\nsrc/second.ts'];
    task.acceptanceCriteria = ['The first line passes\nand the second line remains'];
    const rendered = renderPlanDocument(value);
    expect(rendered).toContain('    - Run checks\n      and retain the full output');
    expect(parsePlanDocument(rendered).phases[0]?.tasks[0]).toMatchObject({
      steps: task.steps,
      fileScopes: task.fileScopes,
      acceptanceCriteria: task.acceptanceCriteria,
    });
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
