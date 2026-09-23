import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

// Types ----------------------------------------------------------------------

export interface DirectoryLockOptions {
  waitMs?: number;
  pollMs?: number;
  operation?: string;
}

// API ------------------------------------------------------------------------

export async function atomicWrite(path: string, content: string): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${crypto.randomUUID()}.tmp`);
  await writeFile(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}

export async function withDirectoryLock<T>(
  lockDir: string,
  operation: () => Promise<T>,
  options: DirectoryLockOptions = {},
): Promise<T> {
  const waitMs = options.waitMs ?? 5_000;
  const pollMs = options.pollMs ?? 25;
  const started = Date.now();

  while (true) {
    try {
      await mkdir(lockDir);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() - started >= waitMs)
        throw new Error(`Timed out waiting to ${options.operation ?? 'acquire lock'}: ${lockDir}`);
      await sleep(pollMs);
    }
  }

  try {
    return await operation();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

// Utils ----------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
