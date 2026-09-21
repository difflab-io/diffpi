import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';

export interface PlanLockOptions {
  waitMs?: number;
  pollMs?: number;
  operation?: string;
}

interface LockOwner {
  token: string;
  pid: number;
  hostname: string;
  operation: string;
  acquiredAt: string;
}

/**
 * Serialize one plan's read-modify-write cycle. Worktrees still share the project
 * `.diffpi` store, so branch isolation does not prevent concurrent plan writes.
 */
export async function withPlanLock<T>(
  planDir: string,
  operation: () => Promise<T>,
  options: PlanLockOptions = {},
): Promise<T> {
  const lockDir = join(planDir, '.lock');
  const waitMs = options.waitMs ?? 5_000;
  const pollMs = options.pollMs ?? 25;
  const owner: LockOwner = {
    token: randomUUID(),
    pid: process.pid,
    hostname: hostname(),
    operation: options.operation ?? 'plan mutation',
    acquiredAt: new Date().toISOString(),
  };
  const started = Date.now();
  while (true) {
    try {
      await mkdir(lockDir);
      await writeFile(join(lockDir, 'owner.json'), `${JSON.stringify(owner)}\n`, { mode: 0o600 });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (Date.now() - started >= waitMs) {
        let existing = 'unknown owner';
        try {
          existing = (await readFile(join(lockDir, 'owner.json'), 'utf8')).trim();
        } catch {
          // The owning process may still be writing its metadata.
        }
        throw new Error(
          `Timed out waiting for plan lock ${lockDir}; owner: ${existing}. Remove it only after confirming the owner is stale.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
  try {
    return await operation();
  } finally {
    let current: LockOwner | undefined;
    try {
      current = JSON.parse(await readFile(join(lockDir, 'owner.json'), 'utf8')) as LockOwner;
    } catch {
      // Preserve a lock whose ownership can no longer be verified.
    }
    if (current?.token === owner.token) await rm(lockDir, { recursive: true, force: true });
  }
}
