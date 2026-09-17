import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, realpath, symlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { run } from './process';

const STORE_LINK = join('.pi', 'diffpi');

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
  if (existsSync(link)) return { slug, root, dest, link, linked: true };
  await mkdir(dest, { recursive: true });
  await mkdir(join(root, '.pi'), { recursive: true });
  await symlink(dest, link);
  return { slug, root, dest, link, linked: true };
}

export async function storeDir(cwd: string, homeDir = homedir()): Promise<string> {
  return (await ensureStore(cwd, homeDir)).dest;
}

export async function reviewsDir(cwd: string, homeDir = homedir()): Promise<string> {
  const dir = join(await storeDir(cwd, homeDir), 'reviews');
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function sessionsDir(cwd: string, homeDir = homedir()): Promise<string> {
  const dir = join(await storeDir(cwd, homeDir), 'sessions');
  await mkdir(dir, { recursive: true });
  return dir;
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
