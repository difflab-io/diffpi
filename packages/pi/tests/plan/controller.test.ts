/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { createPlanController } from '../../src/plan';
import { run } from '../../src/extensions/processx';

async function repo(): Promise<{ cwd: string; home: string }> {
  const base = await mkdtemp(join('/tmp', 'diffpi-plan-store-'));
  const cwd = join(base, 'repo');
  const home = join(base, 'home');
  await run('mkdir', ['-p', cwd]);
  await run('git', ['-C', cwd, 'init', '-q']);
  return { cwd, home };
}

describe('plan controller', () => {
  it('exposes create/read/update operations without leaking store mutation names', async () => {
    const { cwd, home } = await repo();
    const controller = createPlanController({ homeDir: home });
    const created = await controller.create({ cwd, shortSlug: 'crud', branch: 'feature/crud' });
    expect((controller as unknown as Record<string, unknown>).init).toBeUndefined();
    expect((controller as unknown as Record<string, unknown>).mutate).toBeUndefined();
    expect((await controller.read(cwd, created.id)).id).toBe(created.id);
    await expect(
      controller.updateStatus(cwd, created.id, {
        target: { type: 'plan' },
        expectedStatus: 'draft',
        status: 'completed',
        actor: 'review-test',
        message: 'invalid transition',
      }),
    ).rejects.toThrow('Invalid plan status transition');
  });

  it('requires pushed phase CI to settle before commit-per-phase execution completes', async () => {
    const { cwd, home } = await repo();
    const controller = createPlanController({ homeDir: home });
    const created = await controller.create({ cwd, shortSlug: 'ci-state', branch: 'feature/ci-state' });
    const executionId = 'execution-one';
    await controller.update(cwd, created.id, 'prepare CI state', (plan) => ({
      ...plan,
      status: 'in_progress',
      execution: {
        id: executionId,
        mode: 'background',
        policy: 'commit-per-phase',
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
      controller.updateStatus(cwd, created.id, {
        target: { type: 'plan' },
        expectedStatus: 'in_progress',
        status: 'completed',
        actor: 'orchestrator',
        executionId,
        message: 'Complete execution.',
      }),
    ).rejects.toThrow('CI must settle successfully');

    await controller.updateCi(cwd, created.id, {
      phaseId: 'phase-one',
      sha: '0123456789abcdef',
      status: 'passed',
      actor: 'ci-monitor',
      executionId,
      detail: 'CI green',
    });
    const completed = await controller.updateStatus(cwd, created.id, {
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

  it('creates an implementation brief when a phase is added', async () => {
    const { cwd, home } = await repo();
    const controller = createPlanController({ homeDir: home });
    const created = await controller.create({ cwd, shortSlug: 'demo', branch: 'feature/demo' });
    const updated = await controller.update(cwd, created.id, 'add phase', (plan) => ({
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
