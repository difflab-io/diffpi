import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { findExecutable, run, runChecked } from './process';

// Constants -------------------------------------------------------------------

const MISE_HOOK_START = '# >>> @difflab/pi mise >>>';
const MISE_HOOK_END = '# <<< @difflab/pi mise <<<';

// Types -----------------------------------------------------------------------

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

// Public API ------------------------------------------------------------------

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
    const hook = getShellHook(basename(options.shell ?? process.env.SHELL ?? ''), executable, homeDir);
    const current = await getOptionalFile(hook.path);

    if (current.includes(MISE_HOOK_START)) return { path: hook.path, changed: false, planned: false };
    if (options.dryRun) return { path: hook.path, changed: true, planned: true };

    const separator = current.length === 0 || current.endsWith('\n') ? '' : '\n';
    await mkdir(dirname(hook.path), { recursive: true });
    await writeFile(hook.path, `${current}${separator}${hook.content}`, 'utf8');
    return { path: hook.path, changed: true, planned: false };
  },

  async toolCheckGlobal(executable: string, tool: string, minimumVersion?: string): Promise<boolean> {
    const result = await run(executable, ['ls', '--global', '--installed', tool, '--json']);
    return result.code === 0 && isToolInstalled(result.stdout, minimumVersion);
  },

  async toolInstallGlobal(executable: string, specification: string): Promise<void> {
    await runChecked(executable, ['use', '--global', specification]);
  },

  async toolCheckLocal(executable: string, tool: string, cwd = process.cwd()): Promise<boolean> {
    const result = await run(executable, ['ls', '--local', '--installed', tool, '--json'], { cwd });
    return result.code === 0 && isToolInstalled(result.stdout);
  },

  async toolInstallLocal(executable: string, specification: string, cwd = process.cwd()): Promise<void> {
    await runChecked(executable, ['use', '--path', cwd, specification], { cwd });
  },

  async toolUpdateAllGlobal(executable: string, homeDir = homedir()): Promise<void> {
    await runChecked(executable, ['upgrade'], { cwd: homeDir });
  },
};

// Utilities -------------------------------------------------------------------

function getShellHook(shell: string, executable: string, homeDir: string): { path: string; content: string } {
  const command = getShellQuoted(executable);

  switch (shell.toLowerCase()) {
    case 'zsh':
      return {
        path: join(homeDir, '.zshrc'),
        content: `${MISE_HOOK_START}\neval "$(${command} activate zsh)"\n${MISE_HOOK_END}\n`,
      };
    case 'fish':
      return {
        path: join(homeDir, '.config', 'fish', 'config.fish'),
        content: `${MISE_HOOK_START}\n${command} activate fish | source\n${MISE_HOOK_END}\n`,
      };
    case 'nu':
    case 'nushell':
      return {
        path: join(homeDir, '.config', 'nushell', 'config.nu'),
        content: `${MISE_HOOK_START}\nlet mise_bin = ${command}\nlet mise_path = $nu.default-config-dir | path join mise.nu\n^$mise_bin activate nu | save $mise_path --force\nuse ($nu.default-config-dir | path join mise.nu)\n${MISE_HOOK_END}\n`,
      };
    case 'xonsh':
      return {
        path: join(homeDir, '.xonshrc'),
        content: `${MISE_HOOK_START}\nexecx($(${command} activate xonsh))\n${MISE_HOOK_END}\n`,
      };
    case 'elvish':
      return {
        path: join(homeDir, '.config', 'elvish', 'rc.elv'),
        content: `${MISE_HOOK_START}\nvar mise: = (ns [&])\neval (${command} activate elvish | slurp) &ns=$mise: &on-end={|ns| set mise: = $ns }\nmise:activate\n${MISE_HOOK_END}\n`,
      };
    case 'pwsh':
    case 'powershell':
      return {
        path: join(homeDir, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1'),
        content: `${MISE_HOOK_START}\n(& ${command} activate pwsh) | Out-String | Invoke-Expression\n${MISE_HOOK_END}\n`,
      };
    case 'bash':
    default:
      return {
        path: join(homeDir, '.bashrc'),
        content: `${MISE_HOOK_START}\neval "$(${command} activate bash)"\n${MISE_HOOK_END}\n`,
      };
  }
}

function isToolInstalled(output: string, minimumVersion?: string): boolean {
  try {
    const value: unknown = JSON.parse(output);
    if (!Array.isArray(value)) return false;
    return value.some((entry) => {
      if (!entry || typeof entry !== 'object' || !('installed' in entry) || entry.installed !== true) return false;
      if (!minimumVersion) return true;
      if (!('version' in entry) || typeof entry.version !== 'string') return false;
      return isVersionAtLeast(entry.version, minimumVersion);
    });
  } catch {
    return false;
  }
}

function isVersionAtLeast(version: string, minimumVersion: string): boolean {
  const current = version
    .match(/^v?(\d+)\.(\d+)\.(\d+)/)
    ?.slice(1)
    .map(Number);
  const minimum = minimumVersion
    .match(/^v?(\d+)\.(\d+)\.(\d+)/)
    ?.slice(1)
    .map(Number);
  if (!current || !minimum) return false;

  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index] !== minimum[index]) return current[index] > minimum[index];
  }
  return true;
}

async function getOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

function getShellQuoted(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
