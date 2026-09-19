import { createHash } from 'node:crypto';
import { lstat, mkdir, readlink, realpath, symlink, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { inspectGitRepository, type GitRepositoryInfo } from './extensions/gitx';

const STORE_LINK = '.diffpi';
const LEGACY_STORE_LINK = join('.pi', 'diffpi');

export interface StoreInfo {
  slug: string;
  root: string;
  dest: string;
  link: string;
  linked: boolean;
}

export async function computeProjectSlug(cwd: string): Promise<string> {
  return projectSlug(await inspectGitRepository(cwd));
}

export function storeGlobalRoot(homeDir = homedir()): string {
  return join(homeDir, '.difflab', 'diffpi', 'projects');
}

export async function ensureStore(cwd: string, homeDir = homedir()): Promise<StoreInfo> {
  const repository = await inspectGitRepository(cwd);
  const root = repository.root;
  const slug = projectSlug(repository);
  const dest = join(storeGlobalRoot(homeDir), slug);
  const link = join(root, STORE_LINK);
  await mkdir(dest, { recursive: true });
  try {
    await assertStoreLink(link, dest);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await symlink(dest, link);
  }
  await removeLegacyStoreLink(join(root, LEGACY_STORE_LINK), dest);
  return { slug, root, dest, link, linked: true };
}

export async function storeDir(cwd: string, homeDir = homedir()): Promise<string> {
  const store = await ensureStore(cwd, homeDir);
  return store.dest;
}

export async function reviewsDir(cwd: string, homeDir = homedir()): Promise<string> {
  const store = await ensureStore(cwd, homeDir);
  const dir = join(store.link, 'review');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function completedReviewsDir(cwd: string, homeDir = homedir()): Promise<string> {
  const store = await ensureStore(cwd, homeDir);
  const dir = join(store.link, 'reviews');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function sessionsDir(cwd: string, homeDir = homedir()): Promise<string> {
  const store = await ensureStore(cwd, homeDir);
  const dir = join(store.link, 'sessions');
  await mkdir(dir, { recursive: true });
  return dir;
}

async function assertStoreLink(path: string, dest: string): Promise<void> {
  const entry = await lstat(path);
  if (!entry.isSymbolicLink()) throw new Error(`${path} exists and is not a symlink.`);
  const target = await symlinkTarget(path);
  if (target !== (await canonicalPath(dest))) throw new Error(`${path} points to ${target}, not ${dest}.`);
}

async function removeLegacyStoreLink(path: string, dest: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (!entry.isSymbolicLink()) return;
    const target = await symlinkTarget(path);
    if (target === (await canonicalPath(dest))) await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function symlinkTarget(path: string): Promise<string> {
  const target = await readlink(path);
  return canonicalPath(isAbsolute(target) ? target : resolve(dirname(path), target));
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function projectSlug(repository: GitRepositoryInfo): string {
  const readable =
    repository.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unnamed';
  const digest = createHash('sha256').update(repository.identity).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}
