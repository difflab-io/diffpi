import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';

/** Read a directory, or return an empty list when the path does not exist. */
export async function readDirectoryIfExists(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return [];
    throw error;
  }
}

/** Read a UTF-8 file, or return undefined when the path does not exist. */
export async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
