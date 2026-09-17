import { createHash } from 'node:crypto';
import { lstat, mkdir, readlink, realpath, symlink, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { run } from './process';

const STORE_LINK = '.diffpi';
const LEGACY_STORE_LINK = join('.pi', 'diffpi');

export interface StoreInfo {
  slug: string;
  root: string;
  dest: string;
  link: string;
  linked: boolean;
}

export async function gitToplevel(cwd: string): Promise<string> {
  const result = await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  const top = result.stdout.trim();
  return result.code === 0 && top ? top : resolve(cwd);
}

export async function computeProjectSlug(cwd: string): Promise<string> {
  const root = await gitToplevel(cwd);
  const remoteResult = await run('git', ['-C', root, 'remote', 'get-url', 'origin']);
  const remote = remoteResult.code === 0 ? remoteResult.stdout.trim() : '';
  const commonResult = await run('git', ['-C', root, 'rev-parse', '--git-common-dir']);
  const common = commonResult.stdout.trim();
  let commonPath = root;
  if (commonResult.code === 0 && common) {
    const resolvedCommon = isAbsolute(common) ? common : join(root, common);
    commonPath = resolve(resolvedCommon);
  }
  const canonicalCommon = await canonicalPath(commonPath);
  const identity = remote ? `remote:${normalizeRemote(remote)}` : `git-common-dir:${canonicalCommon}`;
  const name = remote ? repositoryName(remote) : basename(resolve(canonicalCommon, '..')) || basename(root);
  const readable =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unnamed';
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 12);
  return `${readable}-${digest}`;
}

export function storeGlobalRoot(homeDir = homedir()): string {
  return join(homeDir, '.difflab', 'diffpi', 'projects');
}

export async function ensureStore(cwd: string, homeDir = homedir()): Promise<StoreInfo> {
  const root = await gitToplevel(cwd);
  const slug = await computeProjectSlug(root);
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

function normalizeRemote(remote: string): string {
  return remote
    .trim()
    .replace(/\.git\/?$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function repositoryName(remote: string): string {
  const normalized = remote
    .trim()
    .replace(/\.git\/?$/i, '')
    .replace(/\/+$/, '');
  return (
    normalized
      .split(/[/\\:]/)
      .filter(Boolean)
      .at(-1) ?? ''
  );
}

function basename(path: string): string {
  const parts = resolve(path).split(/[/\\]/).filter(Boolean);
  return parts.at(-1) ?? '';
}
