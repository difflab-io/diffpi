import { realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { run } from './processx';

export interface GitRepositoryInfo {
  root: string;
  commonDir: string;
  remote?: string;
  name: string;
  identity: string;
}

export async function gitToplevel(cwd: string): Promise<string> {
  const result = await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  const top = result.stdout.trim();
  return result.code === 0 && top ? top : resolve(cwd);
}

export async function inspectGitRepository(cwd: string): Promise<GitRepositoryInfo> {
  const root = await gitToplevel(cwd);
  const remoteResult = await run('git', ['-C', root, 'remote', 'get-url', 'origin']);
  const remote = remoteResult.code === 0 ? remoteResult.stdout.trim() : '';
  const commonResult = await run('git', ['-C', root, 'rev-parse', '--git-common-dir']);
  const common = commonResult.stdout.trim();
  const commonPath =
    commonResult.code === 0 && common ? resolve(isAbsolute(common) ? common : join(root, common)) : root;
  const commonDir = await canonicalPath(commonPath);

  return {
    root,
    commonDir,
    ...(remote ? { remote } : {}),
    name: remote ? repositoryName(remote) : basename(resolve(commonDir, '..')) || basename(root),
    identity: remote ? `remote:${normalizeRemote(remote)}` : `git-common-dir:${commonDir}`,
  };
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

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}
