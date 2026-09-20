import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Stable task label for working-tree and local-revision reviews. */
export const ZED_LOCAL_REVIEW_TASK_NAME = 'diffpi: tuicr local review';
/** Backward-compatible alias for the original public constant. */
export const ZED_REVIEW_TASK_NAME = ZED_LOCAL_REVIEW_TASK_NAME;
export const ZED_PR_REVIEW_TASK_NAME = 'diffpi: tuicr PR review';
export const ZED_PLAN_ANNOTATE_TASK_NAME = 'diffpi: annotate plan';
const LEGACY_ZED_REVIEW_TASK_NAME = 'diffpi: tuicr review';
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

export function zedTasksPath(homeDir = homedir()): string {
  return join(homeDir, '.config', 'zed', 'tasks.json');
}

export function zedKeymapPath(homeDir = homedir()): string {
  return join(homeDir, '.config', 'zed', 'keymap.json');
}

export async function ensureZedReviewTask(
  homeDir = homedir(),
  _command: readonly string[] = ['tuicr', '-w', '-r', 'main..HEAD'],
): Promise<ZedEnsureResult> {
  void _command;
  const path = zedTasksPath(homeDir);
  const currentText = await readOptional(path);
  const tasks = parseJsonArray<ZedTask>(currentText, path);
  // Tasks are global. Keep their argv static and resolve the active worktree,
  // branch, forge, and review target when Zed runs them.
  const migrated = tasks.filter((task) => task.label !== LEGACY_ZED_REVIEW_TASK_NAME);
  const next = [...migrated];
  for (const task of [localReviewTask(), prReviewTask()]) {
    const index = next.findIndex((existing) => existing.label === task.label);
    if (index >= 0) next[index] = { ...next[index], ...task };
    else next.push(task);
  }
  const changed = JSON.stringify(tasks) !== JSON.stringify(next);
  if (changed) await writeJson(path, next);
  return { path, changed, existed: currentText !== undefined };
}

export async function ensureZedPlanTask(packageVersion: string, homeDir = homedir()): Promise<ZedEnsureResult> {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageVersion)) {
    throw new Error(`Invalid @difflab/pi package version: ${packageVersion}.`);
  }
  const path = zedTasksPath(homeDir);
  const currentText = await readOptional(path);
  const tasks = parseJsonArray<ZedTask>(currentText, path);
  const task: ZedTask = {
    label: ZED_PLAN_ANNOTATE_TASK_NAME,
    command: 'npx',
    args: ['--yes', `@difflab/pi@${packageVersion}`, 'plan', 'annotate', '--cwd', '$ZED_WORKTREE_ROOT'],
    cwd: '$ZED_WORKTREE_ROOT',
    use_new_terminal: true,
    reveal: 'always',
    reveal_target: 'center',
  };
  const next = [...tasks];
  const index = next.findIndex((candidate) => candidate.label === task.label);
  if (index >= 0) next[index] = { ...next[index], ...task };
  else next.push(task);
  const changed = JSON.stringify(tasks) !== JSON.stringify(next);
  if (changed) await writeJson(path, next);
  return { path, changed, existed: currentText !== undefined };
}

export async function ensureZedReviewKeybinding(homeDir = homedir()): Promise<ZedEnsureResult> {
  const path = zedKeymapPath(homeDir);
  const currentText = await readOptional(path);
  const entries = parseJsonArray<ZedKeymapEntry>(currentText, path);
  const migrated = entries.map(migrateReviewKeymapEntry);
  const alreadyBound = migrated.some((entry) =>
    Object.values(entry.bindings ?? {}).some(
      (action) => Array.isArray(action) && action[0] === 'task::Spawn' && bindsReviewTask(action[1]),
    ),
  );
  const next: ZedKeymapEntry[] = alreadyBound
    ? migrated
    : [
        ...migrated,
        {
          context: 'Workspace',
          bindings: { [REVIEW_KEYBINDING]: ['task::Spawn', { task_name: ZED_LOCAL_REVIEW_TASK_NAME }] },
        },
      ];
  const changed = JSON.stringify(entries) !== JSON.stringify(next);
  if (changed) await writeJson(path, next);
  return { path, changed, existed: currentText !== undefined };
}

// Utils -----------------------------------------------------------------------

export function zedReviewTaskName(command: readonly string[]): string {
  if (command.some((value, index) => value === 'plan' && command[index + 1] === 'annotate')) {
    return ZED_PLAN_ANNOTATE_TASK_NAME;
  }
  return command[0] === 'tuicr' && command[1] === 'pr' ? ZED_PR_REVIEW_TASK_NAME : ZED_LOCAL_REVIEW_TASK_NAME;
}

const LOCAL_REVIEW_SCRIPT = `set -eu
remote=$(git remote get-url origin 2>/dev/null || true)
branch=$(git branch --show-current)
base=
case "$remote" in
  *github.com*)
    base=$(gh pr list --head "$branch" --state open --limit 100 --json baseRefName,createdAt --jq 'sort_by(.createdAt) | reverse | .[0].baseRefName // empty' 2>/dev/null || true)
    [ -n "$base" ] || base=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name 2>/dev/null || true)
    ;;
  *gitlab*)
    mr=$(glab mr list --source-branch "$branch" --order created_at --sort desc --per-page 100 --output json 2>/dev/null || true)
    base=$(printf '%s' "$mr" | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{let a=JSON.parse(s);process.stdout.write(a[0]?.target_branch||"")}catch{}})')
    [ -n "$base" ] || base=$(glab repo view --output json 2>/dev/null | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).default_branch||"")}catch{}})' || true)
    ;;
esac
[ -n "$base" ] || { echo 'diffpi: could not resolve a GitHub/GitLab review base' >&2; exit 1; }
exec tuicr -w -r "$base..HEAD"`;

const PR_REVIEW_SCRIPT = `set -eu
remote=$(git remote get-url origin 2>/dev/null || true)
branch=$(git branch --show-current)
case "$remote" in
  *github.com*) number=$(gh pr list --head "$branch" --state open --limit 100 --json number,createdAt --jq 'sort_by(.createdAt) | reverse | .[0].number // empty' 2>/dev/null || true) ;;
  *gitlab*) number=$(glab mr list --source-branch "$branch" --order created_at --sort desc --per-page 100 --output json 2>/dev/null | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{try{let a=JSON.parse(s);process.stdout.write(String(a[0]?.iid||a[0]?.number||""))}catch{}})' || true) ;;
  *) number= ;;
esac
[ -n "$number" ] || { echo 'diffpi: could not resolve the current GitHub PR or GitLab MR' >&2; exit 1; }
exec tuicr pr "$number"`;

function staticReviewTask(label: string, script: string): ZedTask {
  return {
    label,
    command: 'sh',
    args: ['-lc', script],
    cwd: '$ZED_WORKTREE_ROOT',
    use_new_terminal: true,
    reveal: 'always',
    reveal_target: 'center',
  };
}

function localReviewTask(): ZedTask {
  return staticReviewTask(ZED_LOCAL_REVIEW_TASK_NAME, LOCAL_REVIEW_SCRIPT);
}
function prReviewTask(): ZedTask {
  return staticReviewTask(ZED_PR_REVIEW_TASK_NAME, PR_REVIEW_SCRIPT);
}

function bindsReviewTask(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { task_name?: unknown }).task_name === ZED_LOCAL_REVIEW_TASK_NAME
  );
}

function migrateReviewKeymapEntry(entry: ZedKeymapEntry): ZedKeymapEntry {
  const bindings = Object.fromEntries(
    Object.entries(entry.bindings ?? {}).map(([key, action]) => {
      if (
        Array.isArray(action) &&
        action[0] === 'task::Spawn' &&
        typeof action[1] === 'object' &&
        action[1] !== null &&
        (action[1] as { task_name?: unknown }).task_name === LEGACY_ZED_REVIEW_TASK_NAME
      ) {
        return [key, ['task::Spawn', { ...action[1], task_name: ZED_LOCAL_REVIEW_TASK_NAME }]];
      }
      return [key, action];
    }),
  );
  return entry.bindings ? { ...entry, bindings } : entry;
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
