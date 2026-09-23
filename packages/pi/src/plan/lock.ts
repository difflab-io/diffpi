import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export async function withPlanLock<T>(
  planDir: string,
  operation: () => Promise<T>,
  options: { waitMs?: number; pollMs?: number; operation?: string } = {},
): Promise<T> {
  const lockDir = join(planDir, '.lock');
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
        throw new Error(`Timed out waiting to ${options.operation ?? 'update plan'}: ${lockDir}`);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  try {
    return await operation();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}
