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
  it('creates an implementation brief when a phase is added', async () => {
    const { cwd, home } = await repo();
    const controller = createPlanController({ homeDir: home });
    const created = await controller.init({ cwd, shortSlug: 'demo', branch: 'feature/demo' });
    const updated = await controller.mutate(cwd, created.id, 'add phase', (plan) => ({
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
