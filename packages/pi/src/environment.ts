import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { resolveBundledAgentsDir } from './assets';
import { findExecutable, run } from './extensions/processx';
import {
  ensureZedPlanTask,
  ensureZedReviewTask,
  zedReviewTaskName,
  ZED_PLAN_ANNOTATE_TASK_NAME,
} from './extensions/zedx';

// Types -----------------------------------------------------------------------

export type Ide = 'zed' | 'vscode' | 'cursor' | 'windsurf' | 'jetbrains' | 'unknown';
export type Mux = 'zellij' | 'tmux' | 'screen' | 'none';
export type ForgeProvider = 'github' | 'gitlab' | 'none';

export interface VcsInfo {
  provider: ForgeProvider;
  host: string;
  owner: string;
  repo: string;
  branch: string;
  root: string;
}

export interface LaunchOptions {
  cwd: string;
  name?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export interface LaunchResult {
  launched: boolean;
  configured?: boolean;
  via: 'zellij' | 'zellij-run' | 'tmux' | 'screen' | 'zed-task' | 'print';
  command: string;
  taskName?: string;
  instruction?: string;
  reason?: string;
}

type Env = NodeJS.ProcessEnv;

// Detection -------------------------------------------------------------------

export function detectIde(env: Env = process.env): Ide {
  const program = (env.TERM_PROGRAM ?? '').toLowerCase();
  if (env.ZED_TERM === 'true' || program === 'zed') return 'zed';
  if (env.CURSOR_TRACE_ID || program === 'cursor') return 'cursor';
  if (env.WINDSURF_ENV || program === 'windsurf') return 'windsurf';
  if (env.TERMINAL_EMULATOR?.toLowerCase().includes('jetbrains')) return 'jetbrains';
  if (env.VSCODE_PID || env.VSCODE_GIT_IPC_HANDLE || program === 'vscode') return 'vscode';
  return 'unknown';
}

export function detectMux(env: Env = process.env): Mux {
  if (env.ZELLIJ || env.ZELLIJ_SESSION_NAME) return 'zellij';
  if (env.TMUX) return 'tmux';
  if (env.STY) return 'screen';
  return 'none';
}

export function detectShell(env: Env = process.env): string {
  return env.SHELL ? basename(env.SHELL) : 'unknown';
}

// VCS -------------------------------------------------------------------------

export async function detectVcs(cwd: string): Promise<VcsInfo> {
  const root = (await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel'])).stdout.trim() || cwd;
  const branch = (await run('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
  const remote = (await run('git', ['-C', root, 'remote', 'get-url', 'origin'])).stdout.trim();
  return { ...parseRemote(remote), branch, root };
}

export function parseRemote(remote: string): { provider: ForgeProvider; host: string; owner: string; repo: string } {
  const empty = { provider: 'none' as ForgeProvider, host: '', owner: '', repo: '' };
  if (!remote) return empty;
  const scp = remote.match(/^[^@]+@([^:]+):(.+?)(?:\.git)?$/);
  const url = remote.match(/^[a-z]+:\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?$/i);
  const match = scp ?? url;
  if (!match) return empty;
  const host = match[1];
  const segments = match[2].split('/').filter(Boolean);
  if (segments.length < 2) return { ...empty, host };
  const repo = segments.at(-1) ?? '';
  const owner = segments.slice(0, -1).join('/');
  const provider: ForgeProvider = /github/i.test(host) ? 'github' : /gitlab/i.test(host) ? 'gitlab' : 'none';
  return { provider, host, owner, repo };
}

// Launch ----------------------------------------------------------------------

export function diffpiLaunchName(cwd: string, workflow: string): string {
  return `diffpi: ${basename(cwd)} / ${workflow}`;
}

export async function openInNewTab(command: string[], opts: LaunchOptions): Promise<LaunchResult> {
  const env = opts.env ?? process.env;
  const name = opts.name ?? 'review';
  const printable = command.join(' ');
  const mux = detectMux(env);
  if (mux !== 'none') {
    const opened = await openMuxTab(mux, command, opts.cwd, name, printable);
    if (opened) return opened;
  }
  if (detectIde(env) === 'zed') {
    try {
      const taskName = zedReviewTaskName(command);
      if (taskName === ZED_PLAN_ANNOTATE_TASK_NAME) await ensureZedPlanTask(await packageVersion(), opts.homeDir);
      else await ensureZedReviewTask(opts.homeDir, command);
      return {
        launched: false,
        configured: true,
        via: 'zed-task',
        command: printable,
        taskName,
        instruction: `Run the Zed task "${taskName}".`,
      };
    } catch {
      // Fall through when Zed's config cannot be edited safely.
    }
  }
  return { launched: false, via: 'print', command: printable };
}

export function screenWindowArgs(command: string[], cwd: string, name: string): string[] {
  return ['-X', 'screen', '-t', name, 'sh', '-lc', 'cd -- "$1" && shift && exec "$@"', 'sh', cwd, ...command];
}

// Utils -----------------------------------------------------------------------

async function packageVersion(): Promise<string> {
  let value: { version?: unknown };
  try {
    value = JSON.parse(await readFile(join(resolveBundledAgentsDir(), '..', 'package.json'), 'utf8')) as typeof value;
  } catch (error) {
    throw new Error('Cannot parse the installed @difflab/pi package metadata.', { cause: error });
  }
  if (typeof value.version !== 'string') throw new Error('Cannot resolve the installed @difflab/pi version.');
  return value.version;
}

async function openMuxTab(
  mux: Mux,
  command: string[],
  cwd: string,
  name: string,
  printable: string,
): Promise<LaunchResult | undefined> {
  if (mux === 'zellij' && (await findExecutable('zellij'))) {
    const result = await run('zellij', ['action', 'new-tab', '--cwd', cwd, '--name', name, '--', ...command]);
    if (result.code === 0) return { launched: true, via: 'zellij', command: printable };
    const fallback = await run('zellij', ['run', '--cwd', cwd, '--name', name, '--', ...command]);
    if (fallback.code === 0) return { launched: true, via: 'zellij-run', command: printable };
  }
  if (mux === 'tmux' && (await findExecutable('tmux'))) {
    const result = await run('tmux', ['new-window', '-c', cwd, '-n', name, printable]);
    if (result.code === 0) return { launched: true, via: 'tmux', command: printable };
  }
  if (mux === 'screen' && (await findExecutable('screen'))) {
    const result = await run('screen', screenWindowArgs(command, cwd, name));
    if (result.code === 0) return { launched: true, via: 'screen', command: printable };
  }
  return undefined;
}
