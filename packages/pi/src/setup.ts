import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ServerEntry } from 'pi-mcp-adapter/types';
import { mcp } from './mcp';
import { mise } from './mise';
import { pi } from './pi';

export type IssueTracker = 'none' | 'linear' | 'jira';
export type SetupStatus = 'ready' | 'installed' | 'updated' | 'skipped' | 'planned';

export interface SetupAction {
  name: string;
  status: SetupStatus;
  detail: string;
}

export interface SetupOptions {
  issueTracker?: IssueTracker;
  installMiseHook?: boolean;
  dryRun?: boolean;
  homeDir?: string;
  agentDir?: string;
  shell?: string;
  platform?: NodeJS.Platform;
  projectDir?: string;
  onProgress?: (message: string) => void;
}

export interface SetupResult {
  actions: SetupAction[];
  restartPi: boolean;
}

export async function ensureMise(options: SetupOptions = {}): Promise<{ executable: string; action: SetupAction }> {
  const homeDir = options.homeDir ?? homedir();
  const current =
    (await mise.executableCheck()) ?? (await mise.executableCheck(join(homeDir, '.local', 'bin', 'mise')));
  if (current) return { executable: current, action: action('mise', 'ready', current) };

  progress(options, 'Installing mise');
  const executable = await mise.install({
    dryRun: options.dryRun,
    homeDir: options.homeDir,
    platform: options.platform,
  });
  return { executable, action: action('mise', options.dryRun ? 'planned' : 'installed', executable) };
}

export async function ensureMiseHooks(miseExecutable: string, options: SetupOptions = {}): Promise<SetupAction> {
  if (options.installMiseHook === false) return action('mise shell hook', 'skipped', 'disabled');

  const result = await mise.hookEnsure(miseExecutable, {
    dryRun: options.dryRun,
    homeDir: options.homeDir,
    shell: options.shell,
  });
  if (!result.changed) return action('mise shell hook', 'ready', result.path);
  return action('mise shell hook', result.planned ? 'planned' : 'installed', result.path);
}

export async function ensureMiseDeps(miseExecutable: string, options: SetupOptions = {}): Promise<SetupAction[]> {
  const canRunMise = Boolean(await mise.executableCheck(miseExecutable));
  const actions: SetupAction[] = [];

  for (const dependency of MISE_DEPENDENCIES) {
    const installed =
      canRunMise && (await mise.toolCheckGlobal(miseExecutable, dependency.tool, dependency.minimumMajor));
    if (installed) {
      actions.push(action(dependency.name, 'ready', dependency.spec));
      continue;
    }

    progress(options, `Installing ${dependency.name} with mise`);
    if (!options.dryRun) await mise.toolInstallGlobal(miseExecutable, dependency.spec);
    actions.push(action(dependency.name, options.dryRun ? 'planned' : 'installed', dependency.spec));
  }

  return actions;
}

export async function ensurePiPlugins(options: SetupOptions = {}): Promise<SetupAction[]> {
  const actions = await ensurePiPackages(PI_PACKAGES, options);
  const agentDir = options.agentDir ?? pi.agentDir(options.homeDir);

  const webSearch = await pi.configEnsure(
    join(agentDir, 'web-search.json'),
    (config) => ({ ...config, workflow: 'auto-summary' }),
    options.dryRun,
  );
  actions.push(configAction('web search settings', webSearch));

  const lsp = await pi.configEnsure(
    join(agentDir, 'pi-lsp.json'),
    (config) => ({
      ...config,
      progressive: { ...record(config.progressive), enabled: true, inject: 'none' },
    }),
    options.dryRun,
  );
  actions.push(configAction('pi-lsp settings', lsp));
  return actions;
}

export async function ensurePiSkills(miseExecutable: string, options: SetupOptions = {}): Promise<SetupAction[]> {
  const agentDir = options.agentDir ?? pi.agentDir(options.homeDir);
  const actions: SetupAction[] = [];

  for (const source of PI_SKILL_SOURCES) {
    const missing: string[] = [];
    for (const name of source.skills) {
      if (await pi.skillCheckGlobal(name, agentDir))
        actions.push(action(`pi skill ${name}`, 'ready', source.repository));
      else missing.push(name);
    }

    if (missing.length === 0) continue;
    progress(options, `Installing skills from ${source.repository}`);
    if (!options.dryRun) await pi.skillInstallGlobal(miseExecutable, source.repository, missing);
    for (const name of missing) {
      actions.push(action(`pi skill ${name}`, options.dryRun ? 'planned' : 'installed', source.repository));
    }
  }

  return actions;
}

export async function ensureMcpAdapters(miseExecutable: string, options: SetupOptions = {}): Promise<SetupAction[]> {
  const actions = await ensurePiPackages([MCP_ADAPTER_PACKAGE], options);
  const projectDir = options.projectDir ?? process.cwd();
  const servers: Record<string, ServerEntry> = {
    'docs-mcp-server': {
      command: miseExecutable,
      args: ['x', 'node@22', '--', 'npx', '-y', '@arabold/docs-mcp-server@latest'],
    },
    mise: {
      command: miseExecutable,
      args: ['--cd', projectDir, 'mcp'],
      env: { MISE_EXPERIMENTAL: '1' },
    },
    'context-mode': {
      command: miseExecutable,
      args: ['x', 'npm:context-mode@latest', '--', 'context-mode'],
    },
  };

  if (options.issueTracker === 'linear') {
    servers.linear = { url: 'https://mcp.linear.app/mcp', auth: 'oauth', protocolVersion: 'auto' };
  } else if (options.issueTracker === 'jira') {
    servers.atlassian = { url: 'https://mcp.atlassian.com/v1/mcp', auth: 'oauth', protocolVersion: 'auto' };
  }

  const result = await mcp.serversEnsure(servers, {
    dryRun: options.dryRun,
    path: mcp.globalConfigPath(options.homeDir),
  });
  actions.push(configAction('MCP configuration', result));
  return actions;
}

export async function setupPi(options: SetupOptions = {}): Promise<SetupResult> {
  const miseResult = await ensureMise(options);
  const actions: SetupAction[] = [miseResult.action];

  actions.push(await ensureMiseHooks(miseResult.executable, options));
  actions.push(...(await ensureMiseDeps(miseResult.executable, options)));
  actions.push(...(await ensurePiPlugins(options)));
  actions.push(...(await ensurePiSkills(miseResult.executable, options)));
  actions.push(...(await ensureMcpAdapters(miseResult.executable, options)));

  return {
    actions,
    restartPi: actions.some(
      (item) =>
        (item.status === 'installed' || item.status === 'updated') &&
        (item.name.startsWith('pi package ') ||
          item.name.startsWith('pi skill ') ||
          item.name === 'MCP configuration' ||
          item.name === 'web search settings' ||
          item.name === 'pi-lsp settings'),
    ),
  };
}

// Utils

const MISE_DEPENDENCIES = [
  { name: 'node', tool: 'node', spec: 'node@22', minimumMajor: 22 },
  { name: 'zellij', tool: 'zellij', spec: 'zellij@latest', minimumMajor: 0 },
  { name: 'helix', tool: 'helix', spec: 'helix@latest', minimumMajor: 0 },
  { name: 'tuicr', tool: 'github:agavra/tuicr', spec: 'github:agavra/tuicr@latest', minimumMajor: 0 },
  { name: 'context-mode', tool: 'npm:context-mode', spec: 'npm:context-mode@latest', minimumMajor: 0 },
] as const;

const PI_PACKAGES = [
  'npm:@tintinweb/pi-subagents',
  'npm:pi-schedule-prompt',
  'npm:@narumitw/pi-btw',
  'npm:pi-web-access',
  'npm:@gitawego/pi-lsp',
  'npm:@juicesharp/rpiv-ask-user-question',
  'npm:context-mode',
] as const;

const PI_SKILL_SOURCES = [
  { repository: 'arabold/docs-mcp-server', skills: ['docs-manage', 'docs-search', 'fetch-url'] },
  { repository: 'AminBlg/SimpleEnglish', skills: ['simple-english'] },
] as const;

const MCP_ADAPTER_PACKAGE = 'npm:pi-mcp-adapter';

async function ensurePiPackages(packages: readonly string[], options: SetupOptions): Promise<SetupAction[]> {
  const executable = await pi.executableCheck();
  if (!executable && !options.dryRun) throw new Error('Install pi before you run diffpi_setup.');
  let installed = executable ? await pi.packageList(executable) : '';
  const actions: SetupAction[] = [];

  for (const source of packages) {
    if (pi.packageCheck(installed, source)) {
      actions.push(action(`pi package ${source}`, 'ready', source));
      continue;
    }

    progress(options, `Installing pi package ${source}`);
    if (!options.dryRun) {
      await pi.packageInstall(executable as string, source);
      installed += `\n${source}`;
    }
    actions.push(action(`pi package ${source}`, options.dryRun ? 'planned' : 'installed', source));
  }

  return actions;
}

function configAction(
  name: string,
  result: { path: string; changed: boolean; existed: boolean; planned: boolean },
): SetupAction {
  if (!result.changed) return action(name, 'ready', result.path);
  if (result.planned) return action(name, 'planned', result.path);
  return action(name, result.existed ? 'updated' : 'installed', result.path);
}

function action(name: string, status: SetupStatus, detail: string): SetupAction {
  return { name, status, detail };
}

function progress(options: SetupOptions, message: string): void {
  options.onProgress?.(message);
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
