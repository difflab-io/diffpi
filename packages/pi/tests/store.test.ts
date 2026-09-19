/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { lstat, mkdir, mkdtemp, readlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { run } from '../src/extensions/processx';
import { completedReviewsDir, computeProjectSlug, ensureStore, reviewsDir } from '../src/store';

async function initRepo(dir: string, remote = 'https://github.com/difflab-io/diffpi.git'): Promise<void> {
  await run('git', ['-C', dir, 'init', '-q']);
  await run('git', ['-C', dir, 'remote', 'add', 'origin', remote]);
}

describe('computeProjectSlug', () => {
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
});

describe('ensureStore', () => {
  it('creates the store destination and root symlink', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'proj');
    const home = join(base, 'home');
    await run('mkdir', ['-p', repo]);
    await initRepo(repo);
    const info = await ensureStore(repo, home);
    expect(info.slug).toMatch(/^diffpi-[a-f0-9]{12}$/);
    expect(info.dest).toBe(join(home, '.difflab', 'diffpi', 'projects', info.slug));
    const link = join(repo, '.diffpi');
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(info.dest);
    expect((await ensureStore(repo, home)).linked).toBe(true);
  });

  it('removes only a matching legacy .pi/diffpi symlink', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'proj');
    const home = join(base, 'home');
    await mkdir(join(repo, '.pi'), { recursive: true });
    await initRepo(repo);
    const slug = await computeProjectSlug(repo);
    const dest = join(home, '.difflab', 'diffpi', 'projects', slug);
    await mkdir(dest, { recursive: true });
    await symlink(relative(repo, dest), join(repo, '.diffpi'));
    const legacy = join(repo, '.pi', 'diffpi');
    await symlink(relative(dirname(legacy), dest), legacy);
    await ensureStore(repo, home);
    expect(lstat(legacy)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(join(repo, '.diffpi'))).isSymbolicLink()).toBe(true);
  });
});

describe('review directories', () => {
  it('creates active artifacts in the singular review directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'proj');
    const home = join(base, 'home');
    await run('mkdir', ['-p', repo]);
    await initRepo(repo);
    expect(await reviewsDir(repo, home)).toEndWith(join('.diffpi', 'review'));
  });

  it('creates completed artifacts in the plural reviews directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-store-'));
    const repo = join(base, 'proj');
    const home = join(base, 'home');
    await run('mkdir', ['-p', repo]);
    await initRepo(repo);
    expect(await completedReviewsDir(repo, home)).toEndWith(join('.diffpi', 'reviews'));
  });
});
