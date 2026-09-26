/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlanRecord } from '../../src/plan/markdown';
import { createPlanStore, type PlanRevisionRequest } from '../../src/plan/store';

async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), 'diffpi-plan-store-'));
  const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-plan-home-'));
  execFileSync('git', ['init', '-b', 'feature/test'], { cwd, stdio: 'ignore' });
  return {
    cwd,
    store: createPlanStore({ homeDir, now: () => new Date('2026-09-21T00:00:00.000Z') }),
  };
}

function completeRequest(text = 'Create the complete plan.'): PlanRevisionRequest {
  return {
    mode: 'create',
    shortSlug: 'demo',
    branch: 'feature/test',
    title: 'Demo plan',
    request: { kind: 'user', text },
    intent: 'Deliver a complete plan backend.',
    requirements: ['Keep authoring revisions immutable.'],
    design: {
      bigIdeas: 'Separate concise plan structure from implementation details.',
      keyApiUpdates: 'Use one atomic apply revision operation.',
      consequences: 'Callers must submit complete briefs.',
    },
    references: [{ id: 'store', value: 'packages/pi/src/plan/store.ts' }],
    phases: [
      {
        id: 'backend',
        title: 'Backend',
        objective: 'Implement storage.',
        dependencies: [],
        tasks: [{ id: 'persist', title: 'Persist revisions', dependencies: [] }],
      },
    ],
    briefs: [
      {
        phaseId: 'backend',
        summary: 'Implement immutable authoring snapshots.',
        apiChanges: ['Add complete revision input.'],
        libraries: [],
        constraints: ['Do not mutate snapshots.'],
        tasks: [
          {
            taskId: 'persist',
            steps: ['Write the snapshot before the latest view.'],
            fileScopes: ['packages/pi/src/plan/store.ts'],
            acceptanceCriteria: ['One request creates one snapshot.'],
          },
        ],
      },
    ],
  };
}

describe('plan store', () => {
  it('initializes one phase-less revision snapshot', async () => {
    const { cwd, store } = await setup();
    const record = await store.init({
      cwd,
      shortSlug: 'demo',
      branch: 'feature/test',
      title: 'Demo plan',
      intent: 'Verify initialization.',
      issueId: 'DIFF-178',
      issueUrl: 'https://linear.app/example/issue/DIFF-178',
    });

    expect((await readdir(record.dir)).sort()).toEqual(['PLAN.md', 'implementation', 'revisions']);
    expect((await readdir(join(record.dir, 'revisions', '0'))).sort()).toEqual([
      'PLAN.md',
      'implementation',
      'metadata.json',
      'request.md',
    ]);
    expect(await readFile(record.planPath, 'utf8')).toContain(
      '- **Issue URL:** https://linear.app/example/issue/DIFF-178',
    );
    expect(record.document).toMatchObject({ revision: 0, phases: [] });
  });

  it('creates a complete first revision with exact request text and ordinal briefs', async () => {
    const { cwd, store } = await setup();
    const exact = 'User request, exactly as typed.\nKeep this second line.';
    const record = await store.applyRevision(cwd, completeRequest(exact));

    expect(await readFile(join(record.dir, 'revisions', '0', 'request.md'), 'utf8')).toBe(exact);
    expect(await readdir(join(record.dir, 'revisions'))).toEqual(['0']);
    expect(await readdir(join(record.dir, 'implementation'))).toEqual(['phase-1.md']);
    const plan = await readFile(record.planPath, 'utf8');
    expect(plan).not.toContain('Ordered Steps');
    expect(plan).not.toContain('File Scopes');
    expect(await readFile(join(record.dir, 'implementation', 'phase-1.md'), 'utf8')).toContain(
      '<!-- diffpi-brief-task: {"id":"persist"} -->',
    );
  });

  it('does not bump content revision or create snapshots for operational mutations', async () => {
    const { cwd, store } = await setup();
    const created = await store.applyRevision(cwd, completeRequest());
    const updated = await store.mutate(cwd, created.id, 'status-only', (plan) => ({ ...plan, status: 'ready' }));

    expect(updated.document.revision).toBe(0);
    expect(await readdir(join(updated.dir, 'revisions'))).toEqual(['0']);
  });

  it('preserves active execution and completed task state during a blocker amendment', async () => {
    const { cwd, store } = await setup();
    const create = completeRequest();
    const created = await store.applyRevision(cwd, create);
    const executionId = 'execution-one';
    await store.mutate(cwd, created.id, 'prepare blocker', (plan) => ({
      ...plan,
      status: 'blocked',
      execution: {
        id: executionId,
        commitMode: 'no-commit',
        cwd,
        branch: plan.branch,
        baseHead: '0123456',
        actor: 'orchestrator',
        startedAt: plan.updatedAt,
        heartbeatAt: plan.updatedAt,
        active: true,
      },
      phases: plan.phases.map((phase) => ({
        ...phase,
        status: 'blocked',
        blocker: { reason: 'Needs amendment.' },
        tasks: phase.tasks.map((task) => ({ ...task, status: 'completed' })),
      })),
    }));
    if (create.mode !== 'create') throw new Error('Expected create request.');
    const amended = await store.applyRevision(cwd, {
      mode: 'amend',
      plan: created.id,
      expectedPlanRevision: 0,
      request: { kind: 'blocker', text: 'Amend the blocked objective.' },
      title: create.title,
      intent: create.intent,
      requirements: create.requirements,
      design: create.design,
      references: create.references,
      phases: create.phases.map((phase) => ({ ...phase, objective: 'Implement storage after the blocker.' })),
      briefs: create.briefs,
    });

    expect(amended.document.revision).toBe(1);
    expect(amended.document.status).toBe('in_progress');
    expect(amended.document.execution).toMatchObject({ id: executionId, active: true });
    expect(amended.document.phases[0]!.tasks[0]!.status).toBe('completed');
    expect(amended.document.phases[0]!.gate.status).toBe('stale');
  });

  it('strict validation detects missing snapshots and mismatched brief ordinals', async () => {
    const { cwd, store } = await setup();
    const created = await store.applyRevision(cwd, completeRequest());
    const briefPath = join(created.dir, 'implementation', 'phase-1.md');
    const brief = await readFile(briefPath, 'utf8');
    await writeFile(briefPath, brief.replace('"ordinal":1', '"ordinal":2'));
    await rm(join(created.dir, 'revisions', '0', 'request.md'));

    const issues = await validatePlanRecord(await store.read(cwd, created.id), { strict: true });
    expect(issues.map((issue) => issue.code)).toContain('brief-marker');
    expect(issues.map((issue) => issue.code)).toContain('snapshot-missing');
  });

  it('rejects incomplete brief IDs without writing a plan', async () => {
    const { cwd, store } = await setup();
    const request = completeRequest();
    if (request.mode !== 'create') throw new Error('Expected create request.');
    request.briefs[0]!.tasks[0]!.taskId = 'wrong-task';

    await expect(store.applyRevision(cwd, request)).rejects.toThrow('task IDs must exactly match');
    expect((await readdir(join(cwd, '.diffpi', 'plan'))).length).toBe(0);
  });
});
