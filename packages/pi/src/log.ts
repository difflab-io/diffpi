import { appendFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { storeDir } from './store';

export interface DiffpiLogEntry {
  message: string;
  label?: string;
  [key: string]: unknown;
}

export type NewLogEntry = DiffpiLogEntry;

export async function appendLogEntry(logPath: string, entry: DiffpiLogEntry): Promise<DiffpiLogEntry> {
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  return entry;
}

export async function appendLog(
  cwd: string,
  filename: string,
  message: string,
  label?: string,
): Promise<DiffpiLogEntry> {
  const entry: DiffpiLogEntry = label === undefined ? { message } : { message, label };
  return appendLogEntry(await resolveLogPath(cwd, filename), entry);
}

export async function readLogEntries<T extends DiffpiLogEntry = DiffpiLogEntry>(
  logPath: string,
  label = 'Diffpi',
): Promise<T[]> {
  let source: string;
  try {
    source = await readFile(logPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return source
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        throw new Error(`Malformed ${label} log entry at line ${index + 1}.`);
      }
    });
}

async function resolveLogPath(cwd: string, filename: string): Promise<string> {
  if (!filename || isAbsolute(filename)) throw new Error('Log filename must be a non-empty relative path.');
  const root = await realpath(cwd);
  const lexicalTarget = resolve(root, filename);
  assertContained(root, lexicalTarget);

  let safeRoot = root;
  let target = lexicalTarget;
  if (filename.startsWith(`.diffpi${sep}`)) {
    const insideStore = filename.slice(`.diffpi${sep}`.length);
    if (insideStore.split(sep).includes('..')) throw new Error('Log filename must stay within cwd.');
    safeRoot = await realpath(await storeDir(root));
    target = resolve(safeRoot, insideStore);
    assertContained(safeRoot, target);
    if (target === safeRoot) throw new Error('Log filename must name a file within the store.');
  }

  await ensureSafeParent(safeRoot, dirname(target));
  try {
    const entry = await lstat(target);
    if (entry.isSymbolicLink()) throw new Error('Log filename must not point through a symlink.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return target;
}

async function ensureSafeParent(root: string, parent: string): Promise<void> {
  assertContained(root, parent);
  let current = root;
  const suffix = relative(root, parent);
  if (!suffix) return;
  for (const part of suffix.split(sep)) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const entry = await lstat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw new Error('Log filename must not pass through a symlink or non-directory.');
  }
}

function assertContained(root: string, target: string): void {
  const targetRelative = relative(root, target);
  if (targetRelative === '..' || targetRelative.startsWith(`..${sep}`) || isAbsolute(targetRelative))
    throw new Error('Log filename must stay within cwd.');
}
