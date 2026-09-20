/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureZedPlanTask, zedTasksPath, ZED_PLAN_ANNOTATE_TASK_NAME } from '../../src/extensions/zedx';

describe('ensureZedPlanTask', () => {
  it('writes one pinned idempotent plan task', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-plan-'));
    expect((await ensureZedPlanTask('0.3.0', home)).changed).toBe(true);
    expect((await ensureZedPlanTask('0.3.0', home)).changed).toBe(false);
    const tasks = JSON.parse(await readFile(zedTasksPath(home), 'utf8')) as Array<{ label: string; args: string[] }>;
    const task = tasks.find((item) => item.label === ZED_PLAN_ANNOTATE_TASK_NAME);
    expect(task?.args).toEqual(['--yes', '@difflab/pi@0.3.0', 'plan', 'annotate', '--cwd', '$ZED_WORKTREE_ROOT']);
  });
});
