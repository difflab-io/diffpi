/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/process';
import { computeProjectSlug, ensureStore } from '../src/store';

async function initRepo(dir: string): Promise<void> {
  await run('git', ['-C', dir, 'init', '-q']);
  await run('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/difflab-io/diffpi.git']);
}

describe('store', () => {
  it('derives a hyphenated slug from the checkout directory name', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'My_Repo');
    await run('mkdir', ['-p', repo]);
    await initRepo(repo);
    expect(await computeProjectSlug(repo)).toBe('my-repo');
  });

  it('creates the store dest and the .pi/diffpi symlink', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'proj');
    const home = join(base, 'home');
    await run('mkdir', ['-p', repo]);
    await initRepo(repo);
    const info = await ensureStore(repo, home);
    expect(info.slug).toBe('proj');
    expect(info.dest).toBe(join(home, '.difflab', 'diffpi', 'projects', 'proj'));
    const link = join(repo, '.pi', 'diffpi');
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(info.dest);
    expect((await ensureStore(repo, home)).linked).toBe(true);
  });
});
