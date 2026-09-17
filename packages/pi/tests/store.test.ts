/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/process';
import { computeProjectSlug, ensureStore } from '../src/store';

async function initRepo(dir: string, remote = 'https://github.com/difflab-io/diffpi.git'): Promise<void> {
  await run('git', ['-C', dir, 'init', '-q']);
  await run('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
}

describe('store', () => {
  it('combines a readable repository name with a stable identity hash', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'My_Repo');
    await run('mkdir', ['-p', repo]);
    await initRepo(repo);
    expect(await computeProjectSlug(repo)).toMatch(/^diffpi-[a-f0-9]{12}$/);
  });

  it('does not collide for unrelated repositories with the same checkout basename', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const first = join(base, 'one', 'project');
    const second = join(base, 'two', 'project');
    await run('mkdir', ['-p', first]);
    await run('mkdir', ['-p', second]);
    await initRepo(first, 'https://github.com/example/first.git');
    await initRepo(second, 'https://github.com/example/second.git');

    expect(await computeProjectSlug(first)).not.toBe(await computeProjectSlug(second));
  });

  it('uses the same key for checkouts of the same remote repository', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const first = join(base, 'one');
    const second = join(base, 'two');
    await run('mkdir', ['-p', first]);
    await run('mkdir', ['-p', second]);
    await initRepo(first);
    await initRepo(second);

    expect(await computeProjectSlug(first)).toBe(await computeProjectSlug(second));
  });

  it('creates the store dest and the .pi/diffpi symlink', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'proj');
    const home = join(base, 'home');
    await run('mkdir', ['-p', repo]);
    await initRepo(repo);
    const info = await ensureStore(repo, home);
    expect(info.slug).toMatch(/^diffpi-[a-f0-9]{12}$/);
    expect(info.dest).toBe(join(home, '.difflab', 'diffpi', 'projects', info.slug));
    const link = join(repo, '.pi', 'diffpi');
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(info.dest);
    expect((await ensureStore(repo, home)).linked).toBe(true);
  });
});
