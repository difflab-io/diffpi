/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlanStore } from '../../src/plan/store';

describe('plan store', () => {
  it('initializes a phase-less plan with only PLAN.md', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'diffpi-plan-store-'));
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-plan-home-'));
    execFileSync('git', ['init', '-b', 'feature/test'], { cwd, stdio: 'ignore' });
    const store = createPlanStore({ homeDir, now: () => new Date('2026-09-21T00:00:00.000Z') });

    const record = await store.init({
      cwd,
      shortSlug: 'demo',
      branch: 'feature/test',
      title: 'Demo plan',
      intent: 'Verify initialization.',
      issueId: 'DIFF-178',
      issueUrl: 'https://linear.app/example/issue/DIFF-178',
    });

    expect(await readdir(record.dir)).toEqual(['PLAN.md']);
    expect(await readFile(record.planPath, 'utf8')).toContain(
      '- **Issue URL:** https://linear.app/example/issue/DIFF-178',
    );
    expect(record.document).toMatchObject({ title: 'Demo plan', intent: 'Verify initialization.', phases: [] });
  });
});
