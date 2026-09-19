/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureZedReviewKeybinding, ensureZedReviewTask, ZED_REVIEW_TASK_NAME, zedTasksPath } from '../src/zed';

describe('zed config merge', () => {
  it('creates tasks.json with the review task and is idempotent', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const first = await ensureZedReviewTask(home);
    expect(first.changed).toBe(true);
    expect(first.existed).toBe(false);
    const tasks = JSON.parse(await readFile(zedTasksPath(home), 'utf8')) as Array<{
      label: string;
      args?: string[];
      reveal_target?: string;
    }>;
    const reviewTask = tasks.find((task) => task.label === ZED_REVIEW_TASK_NAME);
    expect(reviewTask).toBeDefined();
    expect(reviewTask?.reveal_target).toBe('center');
    expect(reviewTask?.args).toBeUndefined();
    expect((await ensureZedReviewTask(home)).changed).toBe(false);
  });

  it('preserves existing tasks', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const path = zedTasksPath(home);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify([{ label: 'my task', command: 'echo hi' }], null, 2), 'utf8');
    await ensureZedReviewTask(home);
    const tasks = JSON.parse(await readFile(path, 'utf8')) as Array<{ label: string }>;
    expect(tasks.map((task) => task.label)).toEqual(expect.arrayContaining(['my task', ZED_REVIEW_TASK_NAME]));
  });

  it('updates the review task with the exact requested command', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    await ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'base..head']);
    const tasks = JSON.parse(await readFile(zedTasksPath(home), 'utf8')) as Array<{
      label: string;
      command: string;
      args?: string[];
    }>;
    expect(tasks.find((task) => task.label === ZED_REVIEW_TASK_NAME)).toMatchObject({
      command: 'tuicr',
      args: ['-w', '-r', 'base..head'],
    });
  });

  it('throws on JSONC content rather than clobbering', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const path = zedTasksPath(home);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '// a comment\n[]\n', 'utf8');
    await expect(ensureZedReviewTask(home)).rejects.toThrow(/not strict JSON/);
  });

  it('adds a keybinding only once', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    expect((await ensureZedReviewKeybinding(home)).changed).toBe(true);
    expect((await ensureZedReviewKeybinding(home)).changed).toBe(false);
  });
});
