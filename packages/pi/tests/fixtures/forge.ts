import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { VcsInfo } from '../../src/environment';

export const githubVcs: VcsInfo = {
  provider: 'github',
  host: 'github.com',
  owner: 'difflab-io',
  repo: 'diffpi',
  branch: 'feature/review',
  root: '/tmp/diffpi',
};

export const gitlabVcs: VcsInfo = {
  ...githubVcs,
  provider: 'gitlab',
  host: 'gitlab.com',
};

export async function withFakeCommand<T>(name: string, source: string, callback: () => Promise<T>): Promise<T> {
  const bin = await mkdtemp(join(tmpdir(), 'diffpi-forge-bin-'));
  const executable = join(bin, name);
  await writeFile(executable, `#!${process.execPath}\n${source}\n`, 'utf8');
  await chmod(executable, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${previousPath ?? ''}`;
  try {
    return await callback();
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
}
