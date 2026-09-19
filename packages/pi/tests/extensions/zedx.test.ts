/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureZedReviewKeybinding,
  ensureZedReviewTask,
  ZED_PR_REVIEW_TASK_NAME,
  ZED_REVIEW_TASK_NAME,
  zedTasksPath,
} from '../../src/extensions/zedx';

describe('ensureZedReviewTask', () => {
  it('creates tasks.json with the review task and is idempotent', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const first = await ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'main..HEAD']);
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
    expect(reviewTask?.command).toBe('sh');
    expect(reviewTask?.args?.[0]).toBe('-lc');
    expect(reviewTask?.args?.[1]).toContain('tuicr -w -r "$base..HEAD"');
    expect((await ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'different..HEAD'])).changed).toBe(false);
  });

  it('preserves existing tasks', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const path = zedTasksPath(home);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify([{ label: 'my task', command: 'echo hi' }], null, 2), 'utf8');
    await ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'main..HEAD']);
    const tasks = JSON.parse(await readFile(path, 'utf8')) as Array<{ label: string }>;
    expect(tasks.map((task) => task.label)).toEqual(expect.arrayContaining(['my task', ZED_REVIEW_TASK_NAME]));
  });

  it('installs both static resolver tasks and leaves them unchanged for different targets', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    await ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'base..head']);
    const before = await readFile(zedTasksPath(home), 'utf8');
    await ensureZedReviewTask(home, ['tuicr', 'pr', '42']);
    expect(await readFile(zedTasksPath(home), 'utf8')).toBe(before);
    const tasks = JSON.parse(before) as Array<{ label: string; command: string; args?: string[] }>;
    expect(tasks.filter((task) => [ZED_REVIEW_TASK_NAME, ZED_PR_REVIEW_TASK_NAME].includes(task.label))).toHaveLength(
      2,
    );
    const localScript = tasks.find((task) => task.label === ZED_REVIEW_TASK_NAME)?.args?.[1];
    const prScript = tasks.find((task) => task.label === ZED_PR_REVIEW_TASK_NAME)?.args?.[1];
    expect(localScript).toContain('gh pr list --head "$branch" --state open');
    expect(localScript).toContain('glab mr list --source-branch "$branch" --order created_at --sort desc');
    expect(prScript).toContain('gh pr list --head "$branch" --state open');
    expect(prScript).toContain('glab mr list --source-branch "$branch" --order created_at --sort desc');
    expect(prScript).toContain('tuicr pr "$number"');
  });

  it('keeps local and PR commands in separate tasks', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    await ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'main..HEAD']);
    await ensureZedReviewTask(home, ['tuicr', 'pr', '42']);
    const tasks = JSON.parse(await readFile(zedTasksPath(home), 'utf8')) as Array<{ label: string; args?: string[] }>;
    expect(tasks.find((task) => task.label === ZED_REVIEW_TASK_NAME)?.args?.[0]).toBe('-lc');
    expect(tasks.find((task) => task.label === ZED_PR_REVIEW_TASK_NAME)?.args?.[0]).toBe('-lc');
  });

  it('migrates the old generic task label', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const path = zedTasksPath(home);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify([{ label: 'diffpi: tuicr review', command: 'tuicr', args: ['-w'] }]), 'utf8');
    await ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'main..HEAD']);
    const tasks = JSON.parse(await readFile(path, 'utf8')) as Array<{ label: string }>;
    expect(tasks.map((task) => task.label)).not.toContain('diffpi: tuicr review');
    expect(tasks.map((task) => task.label)).toContain(ZED_REVIEW_TASK_NAME);
  });

  it('throws on JSONC content rather than clobbering', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const path = zedTasksPath(home);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '// a comment\n[]\n', 'utf8');
    await expect(ensureZedReviewTask(home, ['tuicr', '-w', '-r', 'main..HEAD'])).rejects.toThrow(/not strict JSON/);
  });
});

describe('ensureZedReviewKeybinding', () => {
  it('adds a keybinding only once', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    expect((await ensureZedReviewKeybinding(home)).changed).toBe(true);
    expect((await ensureZedReviewKeybinding(home)).changed).toBe(false);
  });

  it('migrates a legacy generic-task keybinding to the local task', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const path = join(home, '.config', 'zed', 'keymap.json');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      JSON.stringify([
        {
          context: 'Workspace',
          bindings: { 'cmd-alt-r': ['task::Spawn', { task_name: 'diffpi: tuicr review' }] },
        },
      ]),
      'utf8',
    );

    expect((await ensureZedReviewKeybinding(home)).changed).toBe(true);
    const entries = JSON.parse(await readFile(path, 'utf8')) as Array<{
      bindings?: Record<string, [string, { task_name?: string }]>;
    }>;
    expect(entries[0]?.bindings?.['cmd-alt-r']?.[1].task_name).toBe(ZED_REVIEW_TASK_NAME);
    expect((await ensureZedReviewKeybinding(home)).changed).toBe(false);
  });
});
