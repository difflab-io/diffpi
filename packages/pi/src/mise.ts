import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { findExecutable, run, runChecked } from './process';

export interface MiseInstallOptions {
  dryRun?: boolean;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

export interface MiseHookOptions {
  dryRun?: boolean;
  homeDir?: string;
  shell?: string;
}

export interface MiseHookResult {
  path: string;
  changed: boolean;
  planned: boolean;
}

export const mise = {
  async executableCheck(name = 'mise'): Promise<string | undefined> {
    return findExecutable(name);
  },

  async install(options: MiseInstallOptions = {}): Promise<string> {
    const homeDir = options.homeDir ?? homedir();
    const platform = options.platform ?? process.platform;
    if (platform === 'win32') throw new Error('Automatic mise installation supports macOS and Linux only.');

    const installedPath = join(homeDir, '.local', 'bin', 'mise');
    if (options.dryRun) return installedPath;

    await runChecked('sh', ['-c', 'curl -fsSL https://mise.run | sh']);
    const executable = (await findExecutable(installedPath)) ?? (await findExecutable('mise'));
    if (!executable) throw new Error(`mise installation completed, but ${installedPath} was not found.`);
    return executable;
  },

  async hookEnsure(executable: string, options: MiseHookOptions = {}): Promise<MiseHookResult> {
    const homeDir = options.homeDir ?? homedir();
    const hook = shellHook(basename(options.shell ?? process.env.SHELL ?? ''), executable, homeDir);
    const current = await readOptional(hook.path);

    if (current.includes(MISE_HOOK_START)) return { path: hook.path, changed: false, planned: false };
    if (options.dryRun) return { path: hook.path, changed: true, planned: true };

    const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
    await mkdir(dirname(hook.path), { recursive: true });
    await writeFile(hook.path, `${current}${separator}${hook.content}`, 'utf8');
    return { path: hook.path, changed: true, planned: false };
  },

  async toolCheckGlobal(executable: string, tool: string, minimumMajor = 0): Promise<boolean> {
    const result = await run(executable, ['ls', '--global', '--installed', tool, '--json']);
    return result.code === 0 && hasInstalledTool(result.stdout, minimumMajor);
  },

  async toolInstallGlobal(executable: string, specification: string): Promise<void> {
    await runChecked(executable, ['use', '--global', specification]);
  },

  async toolCheckLocal(executable: string, tool: string, cwd = process.cwd()): Promise<boolean> {
    const result = await run(executable, ['ls', '--local', '--installed', tool, '--json'], { cwd });
    return result.code === 0 && hasInstalledTool(result.stdout);
  },

  async toolInstallLocal(executable: string, specification: string, cwd = process.cwd()): Promise<void> {
    await runChecked(executable, ['use', '--path', cwd, specification], { cwd });
  },

  async toolUpdateAllGlobal(executable: string, homeDir = homedir()): Promise<void> {
    await runChecked(executable, ['upgrade'], { cwd: homeDir });
  },
};

const MISE_HOOK_START = '# >>> @difflab/pi mise >>>';
const MISE_HOOK_END = '# <<< @difflab/pi mise <<<';

function shellHook(shell: string, executable: string, homeDir: string): { path: string; content: string } {
  const command = shellQuote(executable);

  if (shell === 'bash') {
    return {
      path: join(homeDir, '.bashrc'),
      content: `${MISE_HOOK_START}\neval "$(${command} activate bash)"\n${MISE_HOOK_END}\n`,
    };
  }

  if (shell === 'zsh') {
    return {
      path: join(homeDir, '.zshrc'),
      content: `${MISE_HOOK_START}\neval "$(${command} activate zsh)"\n${MISE_HOOK_END}\n`,
    };
  }

  if (shell === 'fish') {
    return {
      path: join(homeDir, '.config', 'fish', 'config.fish'),
      content: `${MISE_HOOK_START}\n${command} activate fish | source\n${MISE_HOOK_END}\n`,
    };
  }

  throw new Error(`Unsupported shell "${shell || 'unknown'}". Supported shells: bash, zsh, fish.`);
}

function hasInstalledTool(output: string, minimumMajor = 0): boolean {
  try {
    const value: unknown = JSON.parse(output);
    if (!Array.isArray(value)) return false;
    return value.some((entry) => {
      if (!entry || typeof entry !== 'object' || !('installed' in entry) || entry.installed !== true) return false;
      if (minimumMajor === 0) return true;
      if (!('version' in entry) || typeof entry.version !== 'string') return false;
      return Number.parseInt(entry.version, 10) >= minimumMajor;
    });
  } catch {
    return false;
  }
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
