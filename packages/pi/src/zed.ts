import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const ZED_REVIEW_TASK_NAME = 'diffpi: tuicr review';
const REVIEW_KEYBINDING = 'cmd-alt-r';

interface ZedTask {
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  use_new_terminal?: boolean;
  reveal?: string;
  [key: string]: unknown;
}

interface ZedKeymapEntry {
  context?: string;
  bindings?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ZedEnsureResult {
  path: string;
  changed: boolean;
  existed: boolean;
}

const REVIEW_TASK: ZedTask = {
  label: ZED_REVIEW_TASK_NAME,
  command: 'tuicr',
  args: ['-w'],
  cwd: '$ZED_WORKTREE_ROOT',
  use_new_terminal: true,
  reveal: 'always',
};

export function zedTasksPath(homeDir = homedir()): string {
  return join(homeDir, '.config', 'zed', 'tasks.json');
}

export function zedKeymapPath(homeDir = homedir()): string {
  return join(homeDir, '.config', 'zed', 'keymap.json');
}

export async function ensureZedReviewTask(homeDir = homedir()): Promise<ZedEnsureResult> {
  const path = zedTasksPath(homeDir);
  const currentText = await readOptional(path);
  const tasks = parseJsonArray<ZedTask>(currentText, path);
  const index = tasks.findIndex((task) => task.label === ZED_REVIEW_TASK_NAME);
  const next = [...tasks];
  if (index >= 0) next[index] = { ...tasks[index], ...REVIEW_TASK };
  else next.push(REVIEW_TASK);
  const changed = JSON.stringify(tasks) !== JSON.stringify(next);
  if (changed) await writeJson(path, next);
  return { path, changed, existed: currentText !== undefined };
}

export async function ensureZedReviewKeybinding(homeDir = homedir()): Promise<ZedEnsureResult> {
  const path = zedKeymapPath(homeDir);
  const currentText = await readOptional(path);
  const entries = parseJsonArray<ZedKeymapEntry>(currentText, path);
  const alreadyBound = entries.some((entry) =>
    Object.values(entry.bindings ?? {}).some(
      (action) => Array.isArray(action) && action[0] === 'task::Spawn' && bindsReviewTask(action[1]),
    ),
  );
  if (alreadyBound) return { path, changed: false, existed: currentText !== undefined };
  const next: ZedKeymapEntry[] = [
    ...entries,
    { context: 'Workspace', bindings: { [REVIEW_KEYBINDING]: ['task::Spawn', { task_name: ZED_REVIEW_TASK_NAME }] } },
  ];
  await writeJson(path, next);
  return { path, changed: true, existed: currentText !== undefined };
}

function bindsReviewTask(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { task_name?: unknown }).task_name === ZED_REVIEW_TASK_NAME
  );
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseJsonArray<T>(content: string | undefined, path: string): T[] {
  if (!content?.trim()) return [];
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(`Cannot safely edit ${path}: not strict JSON (it may contain JSONC comments).`);
  }
  if (!Array.isArray(value)) throw new Error(`Expected a JSON array in ${path}.`);
  return value as T[];
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
