/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from '../../src/extensions/processx';
import { assertPhasePushEligible, retryPlanCi, updatePlanCi, updatePlanStatus } from '../../src/plan/operations';
import { createPlanStore, type PlanStoreOptions } from '../../src/plan/store';

function createPlanApi(options: PlanStoreOptions = {}) {
  const store = createPlanStore(options);
  return {
    context: store.context,
    create: store.init,
    read: store.read,
    update: store.mutate,
    appendLog: store.log,
    updateStatus: (cwd: string, query: string, input: Parameters<typeof updatePlanStatus>[3]) =>
      updatePlanStatus(store, cwd, query, input),
    updateCi: (cwd: string, query: string, input: Parameters<typeof updatePlanCi>[3]) =>
      updatePlanCi(store, cwd, query, input),
    retryCi: (cwd: string, query: string, input: Parameters<typeof retryPlanCi>[3]) =>
      retryPlanCi(store, cwd, query, input),
    assertPhasePushEligible,
  };
}

async function repo(): Promise<{ cwd: string; home: string }> {
  const base = await mkdtemp(join('/tmp', 'diffpi-plan-store-'));
  const cwd = join(base, 'repo');
  const home = join(base, 'home');
  await run('mkdir', ['-p', cwd]);
  await run('git', ['-C', cwd, 'init', '-q']);
  return { cwd, home };
}

describe('plan operations', () => {
  it('applies status transitions through the plan store', async () => {
    const { cwd, home } = await repo();
    const plan = createPlanApi({ homeDir: home });
    const created = await plan.create({ cwd, shortSlug: 'crud', branch: 'feature/crud' });
    expect((await plan.read(cwd, created.id)).id).toBe(created.id);
    await expect(
      plan.updateStatus(cwd, created.id, {
        target: { type: 'plan' },
        expectedStatus: 'draft',
        status: 'completed',
        actor: 'review-test',
        message: 'invalid transition',
      }),
    ).rejects.toThrow('Invalid plan status transition');
  });

  it('requires pushed phase CI to settle before push execution completes', async () => {
    const { cwd, home } = await repo();
    const plan = createPlanApi({ homeDir: home });
    const created = await plan.create({ cwd, shortSlug: 'ci-state', branch: 'feature/ci-state' });
    const executionId = 'execution-one';
    await plan.update(cwd, created.id, 'prepare CI state', (plan) => ({
      ...plan,
      status: 'in_progress',
      execution: {
        id: executionId,
        commitMode: 'push',
        cwd,
        branch: plan.branch,
        baseHead: '0123456',
        actor: 'orchestrator',
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        active: true,
      },
      phases: [
        {
          id: 'phase-one',
          revision: 1,
          title: 'First phase',
          objective: 'Build the first slice.',
          dependencies: [],
          tasks: [],
          status: 'completed',
          gate: { phaseRevision: 0, status: 'passed', results: [] },
          commit: {
            sha: '0123456789abcdef',
            subject: 'feat(plan): ship first phase',
            completedAt: new Date().toISOString(),
            pushedAt: new Date().toISOString(),
            ci: { status: 'pending', startedAt: new Date().toISOString() },
          },
        },
      ],
    }));

    await expect(
      plan.updateStatus(cwd, created.id, {
        target: { type: 'plan' },
        expectedStatus: 'in_progress',
        status: 'completed',
        actor: 'orchestrator',
        executionId,
        message: 'Complete execution.',
      }),
    ).rejects.toThrow('CI must settle successfully');

    await plan.updateCi(cwd, created.id, {
      phaseId: 'phase-one',
      sha: '0123456789abcdef',
      status: 'passed',
      actor: 'ci-monitor',
      executionId,
      detail: 'CI green',
    });
    const completed = await plan.updateStatus(cwd, created.id, {
      target: { type: 'plan' },
      expectedStatus: 'in_progress',
      status: 'completed',
      actor: 'orchestrator',
      executionId,
      message: 'Complete execution.',
    });

    expect(completed.record.document.status).toBe('completed');
    expect(completed.record.document.phases[0]?.commit?.ci?.status).toBe('passed');
  });

  it('enforces phase and task dependencies during execution', async () => {
    const { cwd, home } = await repo();
    const plan = createPlanApi({ homeDir: home });
    const created = await plan.create({ cwd, shortSlug: 'dependencies', branch: 'feature/dependencies' });
    const executionId = 'dependency-run';
    await plan.update(cwd, created.id, 'prepare dependencies', (plan) => ({
      ...plan,
      status: 'in_progress',
      execution: {
        id: executionId,
        commitMode: 'no-commit',
        cwd,
        branch: plan.branch,
        baseHead: '0123456',
        actor: 'orchestrator',
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        active: true,
      },
      phases: [
        {
          id: 'phase-one',
          revision: 0,
          title: 'First',
          objective: 'First.',
          dependencies: [],
          status: 'in_progress',
          gate: { phaseRevision: 0, status: 'pending', results: [] },
          tasks: [
            {
              id: 'task-one',
              revision: 0,
              title: 'First task',
              dependencies: [],
              fileScopes: [],
              acceptanceCriteria: [],
              status: 'pending',
            },
            {
              id: 'task-two',
              revision: 0,
              title: 'Second task',
              dependencies: ['task-one'],
              fileScopes: [],
              acceptanceCriteria: [],
              status: 'pending',
            },
          ],
        },
        {
          id: 'phase-two',
          revision: 0,
          title: 'Second',
          objective: 'Second.',
          dependencies: ['phase-one'],
          status: 'pending',
          gate: { phaseRevision: 0, status: 'pending', results: [] },
          tasks: [],
        },
      ],
    }));

    await expect(
      plan.updateStatus(cwd, created.id, {
        target: { type: 'phase', id: 'phase-two' },
        expectedStatus: 'pending',
        status: 'in_progress',
        actor: 'orchestrator',
        executionId,
        message: 'Start second phase.',
      }),
    ).rejects.toThrow('incomplete dependencies');
    await expect(
      plan.updateStatus(cwd, created.id, {
        target: { type: 'task', id: 'task-two' },
        expectedStatus: 'pending',
        status: 'in_progress',
        actor: 'worker',
        executionId,
        message: 'Start second task.',
      }),
    ).rejects.toThrow('incomplete dependencies');
  });

  it('invalidates later passed gates when a phase records pending CI', async () => {
    const { cwd, home } = await repo();
    const plan = createPlanApi({ homeDir: home });
    const created = await plan.create({ cwd, shortSlug: 'stale-gates', branch: 'feature/stale-gates' });
    const executionId = 'stale-gates-run';
    const sha = 'b'.repeat(40);
    await plan.update(cwd, created.id, 'prepare phase completion', (plan) => ({
      ...plan,
      status: 'in_progress',
      execution: {
        id: executionId,
        commitMode: 'push',
        cwd,
        branch: plan.branch,
        baseHead: '0123456',
        actor: 'orchestrator',
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        active: true,
      },
      phases: [
        {
          id: 'phase-one',
          revision: 0,
          title: 'First',
          objective: 'First.',
          dependencies: [],
          tasks: [],
          status: 'in_progress',
          gate: { phaseRevision: 0, status: 'passed', results: [] },
        },
        {
          id: 'phase-two',
          revision: 0,
          title: 'Second',
          objective: 'Second.',
          dependencies: [],
          tasks: [],
          status: 'in_progress',
          gate: { phaseRevision: 0, status: 'passed', results: [] },
        },
      ],
    }));

    const completed = await plan.updateStatus(cwd, created.id, {
      target: { type: 'phase', id: 'phase-one' },
      expectedStatus: 'in_progress',
      status: 'completed',
      actor: 'worker',
      executionId,
      message: 'Complete first phase.',
      commit: {
        sha,
        subject: 'feat: first phase',
        completedAt: new Date().toISOString(),
        pushedAt: new Date().toISOString(),
        ci: { status: 'pending', startedAt: new Date().toISOString() },
      },
    });
    expect(completed.record.document.phases[1]?.gate.status).toBe('stale');
    await expect(
      plan.updateStatus(cwd, created.id, {
        target: { type: 'phase', id: 'phase-one' },
        expectedStatus: 'completed',
        status: 'completed',
        actor: 'worker',
        executionId,
        message: 'Replace failed CI metadata.',
        commit: {
          sha: 'c'.repeat(40),
          subject: 'feat: replacement',
          completedAt: new Date().toISOString(),
          pushedAt: new Date().toISOString(),
          ci: { status: 'pending', startedAt: new Date().toISOString() },
        },
      }),
    ).rejects.toThrow('cannot transition again');
  });

  it('allows an audited retry of failed CI and guards the next phase push', async () => {
    const { cwd, home } = await repo();
    const plan = createPlanApi({ homeDir: home });
    const created = await plan.create({ cwd, shortSlug: 'ci-retry', branch: 'feature/ci-retry' });
    const executionId = 'ci-retry-run';
    const sha = 'a'.repeat(40);
    const prepared = await plan.update(cwd, created.id, 'prepare failed CI', (plan) => ({
      ...plan,
      status: 'in_progress',
      execution: {
        id: executionId,
        commitMode: 'push',
        cwd,
        branch: plan.branch,
        baseHead: '0123456',
        actor: 'orchestrator',
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        active: true,
      },
      phases: [
        {
          id: 'phase-one',
          revision: 1,
          title: 'First',
          objective: 'First.',
          dependencies: [],
          tasks: [],
          status: 'completed',
          gate: { phaseRevision: 0, status: 'passed', results: [] },
          commit: {
            sha,
            subject: 'feat: first',
            completedAt: new Date().toISOString(),
            pushedAt: new Date().toISOString(),
            ci: { status: 'failed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
          },
        },
        {
          id: 'phase-two',
          revision: 0,
          title: 'Second',
          objective: 'Second.',
          dependencies: ['phase-one'],
          tasks: [],
          status: 'in_progress',
          gate: { phaseRevision: 0, status: 'passed', results: [] },
        },
      ],
    }));

    expect(() => plan.assertPhasePushEligible(prepared.document, 'phase-two', executionId)).toThrow(
      'Prior phase CI must settle',
    );
    const unfinished = structuredClone(prepared.document);
    unfinished.phases[0]!.status = 'in_progress';
    unfinished.phases[0]!.commit = undefined;
    expect(() => plan.assertPhasePushEligible(unfinished, 'phase-two', executionId)).toThrow(
      'Prior phase CI must settle',
    );
    await plan.retryCi(cwd, created.id, {
      phaseId: 'phase-one',
      sha,
      actor: 'ci-monitor',
      executionId,
      reason: 'Retry flaky CI.',
    });
    await plan.updateCi(cwd, created.id, {
      phaseId: 'phase-one',
      sha,
      status: 'passed',
      actor: 'ci-monitor',
      executionId,
      detail: 'CI green',
    });
    const settled = await plan.read(cwd, created.id);
    expect(() => plan.assertPhasePushEligible(settled.document, 'phase-two', executionId)).not.toThrow();
    expect(settled.document.phases[0]?.commit?.ci?.status).toBe('passed');
  });

  it('creates an implementation brief when a phase is added', async () => {
    const { cwd, home } = await repo();
    const plan = createPlanApi({ homeDir: home });
    const created = await plan.create({ cwd, shortSlug: 'demo', branch: 'feature/demo' });
    const updated = await plan.update(cwd, created.id, 'add phase', (plan) => ({
      ...plan,
      phases: [
        {
          id: 'phase-one',
          revision: 0,
          title: 'First phase',
          objective: 'Build the first slice.',
          dependencies: [],
          tasks: [],
          status: 'pending',
          gate: { phaseRevision: 0, status: 'pending', results: [] },
        },
      ],
    }));
    expect(updated.implementationDir).toBe(join(updated.dir, 'implementation'));
    expect(await readFile(join(updated.dir, 'implementation', 'phase-phase-one.md'), 'utf8')).toContain(
      'Build the first slice.',
    );
  });
});
