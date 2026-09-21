import { parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { ServerEntry } from 'pi-mcp-adapter/types';
import { resolveBundledAgentsDir } from './assets';
import { findPreferredModel, loadDiffpiConfig, resolveAgentModelPreferences, type DiffpiConfig } from './config';
import { detectVcs } from './environment';
import { mcp } from './mcp';
import { mise } from './extensions/misex';
import { pi } from './pi';
import { ensureZedPlanTask, ensureZedReviewKeybinding, ensureZedReviewTask } from './extensions/zedx';

// Constants -------------------------------------------------------------------

const MISE_DEPENDENCIES = [
  // pi requires Node.js 22.19 or newer; Grounded Docs also requires Node.js 22+.
  { name: 'node', tool: 'node', spec: 'node@22', minimumVersion: '22.19.0' },
  { name: 'zellij', tool: 'zellij', spec: 'zellij@latest', minimumVersion: undefined },
  { name: 'helix', tool: 'helix', spec: 'helix@latest', minimumVersion: undefined },
  {
    name: 'tuicr',
    tool: 'github:agavra/tuicr',
    spec: 'github:agavra/tuicr@latest',
    minimumVersion: undefined,
  },
  {
    name: 'context-mode',
    tool: 'npm:context-mode',
    spec: 'npm:context-mode@latest',
    minimumVersion: undefined,
  },
] as const;

const PI_PACKAGES = [
  'npm:@tintinweb/pi-subagents',
  'npm:pi-schedule-prompt',
  'npm:@narumitw/pi-btw',
  'npm:pi-web-access',
  'npm:@gitawego/pi-lsp',
  'npm:context-mode',
] as const;

const PI_SKILL_SOURCES = [
  { repository: 'arabold/docs-mcp-server', skills: ['docs-manage', 'docs-search', 'fetch-url'] },
  { repository: 'AminBlg/SimpleEnglish', skills: ['simple-english'] },
  { repository: 'cloudvoyant/codevoyant', skills: ['git'] },
] as const;

const MCP_ADAPTER_PACKAGE = 'npm:pi-mcp-adapter';
const BUNDLED_AGENTS_DIR = resolveBundledAgentsDir();

// Types -----------------------------------------------------------------------

export type IssueTracker = 'none' | 'linear' | 'jira';
export type Forge = 'none' | 'github' | 'gitlab';
export type SetupStatus = 'ready' | 'installed' | 'updated' | 'skipped' | 'planned';

export interface SetupAction {
  name: string;
  status: SetupStatus;
  detail: string;
}

export interface SetupOptions {
  issueTracker?: IssueTracker;
  /** Hosted VCS integrations to install. `forge` remains as a legacy single-value alias. */
  forges?: readonly Exclude<Forge, 'none'>[];
  forge?: Forge;
  bindZedKey?: boolean;
  installMiseHook?: boolean;
  dryRun?: boolean;
  homeDir?: string;
  agentDir?: string;
  bundledAgentsDir?: string;
  shell?: string;
  platform?: NodeJS.Platform;
  projectDir?: string;
  availableModels?: readonly { provider: string; id: string }[];
  onProgress?: (message: string) => void;
}

type MiseDependency = { name: string; tool: string; spec: string; minimumVersion: string | undefined };

const FORGE_DEPENDENCIES: Record<Exclude<Forge, 'none'>, MiseDependency> = {
  github: { name: 'gh', tool: 'gh', spec: 'gh@latest', minimumVersion: undefined },
  gitlab: { name: 'glab', tool: 'glab', spec: 'glab@latest', minimumVersion: undefined },
};

export interface SetupResult {
  actions: SetupAction[];
  restartPi: boolean;
}

// Setup operations ------------------------------------------------------------

export async function ensureMise(options: SetupOptions = {}): Promise<{ executable: string; action: SetupAction }> {
  const homeDir = options.homeDir ?? homedir();
  const current =
    (await mise.executableCheck()) ?? (await mise.executableCheck(join(homeDir, '.local', 'bin', 'mise')));
  if (current) return { executable: current, action: createSetupAction('mise', 'ready', current) };

  reportProgress(options, 'Installing mise');
  const executable = await mise.install({
    dryRun: options.dryRun,
    homeDir: options.homeDir,
    platform: options.platform,
  });
  return {
    executable,
    action: createSetupAction('mise', options.dryRun ? 'planned' : 'installed', executable),
  };
}

export async function ensureMiseHooks(miseExecutable: string, options: SetupOptions = {}): Promise<SetupAction> {
  if (options.installMiseHook === false) return createSetupAction('mise shell hook', 'skipped', 'disabled');

  const result = await mise.hookEnsure(miseExecutable, {
    dryRun: options.dryRun,
    homeDir: options.homeDir,
    shell: options.shell,
  });
  if (!result.changed) return createSetupAction('mise shell hook', 'ready', result.path);
  return createSetupAction('mise shell hook', result.planned ? 'planned' : 'installed', result.path);
}

export async function ensureMiseDeps(miseExecutable: string, options: SetupOptions = {}): Promise<SetupAction[]> {
  const canRunMise = Boolean(await mise.executableCheck(miseExecutable));
  const actions: SetupAction[] = [];
  const dependencies: MiseDependency[] = [
    ...MISE_DEPENDENCIES,
    ...configuredForges(options).map((forge) => FORGE_DEPENDENCIES[forge]),
  ];

  for (const dependency of dependencies) {
    const installed =
      canRunMise && (await mise.toolCheckGlobal(miseExecutable, dependency.tool, dependency.minimumVersion));
    if (installed) {
      actions.push(createSetupAction(dependency.name, 'ready', dependency.spec));
      continue;
    }

    reportProgress(options, `Installing ${dependency.name} with mise`);
    if (!options.dryRun) await mise.toolInstallGlobal(miseExecutable, dependency.spec);
    actions.push(createSetupAction(dependency.name, options.dryRun ? 'planned' : 'installed', dependency.spec));
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
  actions.push(getConfigSetupAction('web search settings', webSearch));

  const lsp = await pi.configEnsure(
    join(agentDir, 'pi-lsp.json'),
    (config) => ({
      ...config,
      progressive: { ...getRecord(config.progressive), enabled: true, inject: 'none' },
    }),
    options.dryRun,
  );
  actions.push(getConfigSetupAction('pi-lsp settings', lsp));
  return actions;
}

export async function ensurePiAgents(options: SetupOptions = {}): Promise<SetupAction[]> {
  const agentDir = options.agentDir ?? pi.agentDir(options.homeDir);
  const bundledAgentsDir = options.bundledAgentsDir ?? BUNDLED_AGENTS_DIR;
  const userConfig = await loadDiffpiConfig({ homeDir: options.homeDir });
  const entries = (await readdir(bundledAgentsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith('diffpi-') && entry.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name));
  const actions: SetupAction[] = [];

  for (const entry of entries) {
    const id = basename(entry.name, '.md').replace(/^diffpi-/, '');
    const source = await readFile(join(bundledAgentsDir, entry.name), 'utf8');
    const content = materializeAgentModels(source, id, userConfig.config, options.availableModels);
    const result = await pi.agentEnsure(entry.name, content, agentDir, options.dryRun);
    actions.push(getConfigSetupAction(`pi agent ${id}`, result));
  }

  return actions;
}

export async function ensurePiSkills(miseExecutable: string, options: SetupOptions = {}): Promise<SetupAction[]> {
  const agentDir = options.agentDir ?? pi.agentDir(options.homeDir);
  const sharedSkillsDir = join(options.homeDir ?? homedir(), '.agents', 'skills');
  const actions: SetupAction[] = [];

  for (const source of PI_SKILL_SOURCES) {
    const missing: string[] = [];
    for (const name of source.skills) {
      if (await pi.skillCheckGlobal(name, agentDir, sharedSkillsDir))
        actions.push(createSetupAction(`pi skill ${name}`, 'ready', source.repository));
      else missing.push(name);
    }

    if (missing.length === 0) continue;
    reportProgress(options, `Installing skills from ${source.repository}`);
    if (!options.dryRun) await pi.skillInstallGlobal(miseExecutable, source.repository, missing);
    for (const name of missing) {
      actions.push(createSetupAction(`pi skill ${name}`, options.dryRun ? 'planned' : 'installed', source.repository));
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

  for (const forge of configuredForges(options)) {
    if (forge === 'github') {
      servers.github = { url: 'https://api.githubcopilot.com/mcp/', auth: 'oauth', protocolVersion: 'auto' };
      continue;
    }
    const host = await gitlabMcpHost(projectDir);
    servers.gitlab = { url: `https://${host}/api/v4/mcp`, auth: 'oauth', protocolVersion: 'auto' };
  }

  const result = await mcp.serversEnsure(servers, {
    dryRun: options.dryRun,
    path: mcp.globalConfigPath(options.homeDir),
  });
  actions.push(getConfigSetupAction('MCP configuration', result));
  return actions;
}

// Orchestration ---------------------------------------------------------------

export async function setupPi(options: SetupOptions = {}): Promise<SetupResult> {
  const miseResult = await ensureMise(options);
  const actions: SetupAction[] = [miseResult.action];

  actions.push(await ensureMiseHooks(miseResult.executable, options));
  actions.push(...(await ensureMiseDeps(miseResult.executable, options)));
  actions.push(...(await ensurePiPlugins(options)));
  actions.push(...(await ensurePiAgents(options)));
  actions.push(...(await ensurePiSkills(miseResult.executable, options)));
  actions.push(...(await ensureMcpAdapters(miseResult.executable, options)));
  if (options.bindZedKey) actions.push(...(await ensureZedIntegration(options)));

  return {
    actions,
    restartPi: setupRequiresRestart(actions),
  };
}

export function setupRequiresRestart(actions: readonly SetupAction[]): boolean {
  return actions.some(
    (item) =>
      (item.status === 'installed' || item.status === 'updated') &&
      (item.name.startsWith('pi package ') ||
        item.name.startsWith('pi agent ') ||
        item.name.startsWith('pi skill ') ||
        item.name === 'MCP configuration' ||
        item.name === 'web search settings' ||
        item.name === 'pi-lsp settings'),
  );
}

export async function ensureZedIntegration(options: SetupOptions = {}): Promise<SetupAction[]> {
  if (options.dryRun) {
    const actions = [
      createSetupAction('Zed review tasks', 'planned', 'global static runtime-resolver tasks in tasks.json'),
      createSetupAction('Zed plan task', 'planned', 'pinned package CLI task in tasks.json'),
    ];
    if (options.bindZedKey) actions.push(createSetupAction('Zed review keybinding', 'planned', 'keymap.json'));
    return actions;
  }
  const actions: SetupAction[] = [];
  try {
    const tasks = await ensureZedReviewTask(options.homeDir);
    actions.push(createSetupAction('Zed review tasks', tasks.changed ? 'installed' : 'ready', tasks.path));
    const planTask = await ensureZedPlanTask(await packageVersion(), options.homeDir);
    actions.push(createSetupAction('Zed plan task', planTask.changed ? 'installed' : 'ready', planTask.path));
  } catch (error) {
    actions.push(
      createSetupAction('Zed review tasks', 'skipped', error instanceof Error ? error.message : String(error)),
    );
  }
  if (options.bindZedKey) {
    try {
      const key = await ensureZedReviewKeybinding(options.homeDir);
      actions.push(createSetupAction('Zed review keybinding', key.changed ? 'installed' : 'ready', key.path));
    } catch (error) {
      actions.push(
        createSetupAction('Zed review keybinding', 'skipped', error instanceof Error ? error.message : String(error)),
      );
    }
  }
  return actions;
}

export async function gitlabMcpHost(projectDir: string): Promise<string> {
  try {
    const vcs = await detectVcs(projectDir);
    return vcs.provider === 'gitlab' && vcs.host ? vcs.host : 'gitlab.com';
  } catch {
    return 'gitlab.com';
  }
}

// Core ------------------------------------------------------------------------

function materializeAgentModels(
  content: string,
  agentId: string,
  config: DiffpiConfig,
  availableModels?: readonly { provider: string; id: string }[],
): string {
  const { frontmatter } = parseFrontmatter<Record<string, unknown>>(
    content.startsWith('\uFEFF') ? content.slice(1) : content,
  );
  const profilePreferences = [...getTextList(frontmatter.model), ...getTextList(frontmatter.model_fallbacks)];
  const preferences = resolveAgentModelPreferences(agentId, profilePreferences, config);
  let selectedIndex = availableModels === undefined && preferences.length > 0 ? 0 : -1;
  let selectedModel = selectedIndex === 0 ? preferences[0] : undefined;

  if (availableModels) {
    for (const [index, preference] of preferences.entries()) {
      const match = findPreferredModel(availableModels, preference);
      if (!match) continue;
      selectedIndex = index;
      selectedModel = `${match.provider}/${match.id}`;
      break;
    }
  }

  const fallbacks = preferences.filter((_preference, index) => index !== selectedIndex);
  return replaceAgentModelFields(content, selectedModel, fallbacks);
}

function replaceAgentModelFields(content: string, model: string | undefined, fallbacks: readonly string[]): string {
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.replaceAll('\r\n', '\n').split('\n');
  const closingDelimiter = lines.indexOf('---', 1);
  if (lines[0] !== '---' || closingDelimiter < 0) return content;

  const frontmatter = lines.slice(1, closingDelimiter).filter((line) => !/^model(?:_fallbacks)?:/.test(line));
  if (model) frontmatter.push(`model: ${model}`);
  if (fallbacks.length > 0) frontmatter.push(`model_fallbacks: ${fallbacks.join(', ')}`);

  return ['---', ...frontmatter, '---', ...lines.slice(closingDelimiter + 1)].join(newline);
}

async function ensurePiPackages(packages: readonly string[], options: SetupOptions): Promise<SetupAction[]> {
  const executable = await pi.executableCheck();
  if (!executable && !options.dryRun) throw new Error('Install pi before you run diffpi_setup.');
  let installed = executable ? await pi.packageList(executable) : '';
  const actions: SetupAction[] = [];

  for (const source of packages) {
    if (pi.packageCheck(installed, source)) {
      actions.push(createSetupAction(`pi package ${source}`, 'ready', source));
      continue;
    }

    reportProgress(options, `Installing pi package ${source}`);
    if (!options.dryRun) {
      await pi.packageInstall(executable as string, source);
      installed += `\n${source}`;
    }
    actions.push(createSetupAction(`pi package ${source}`, options.dryRun ? 'planned' : 'installed', source));
  }

  return actions;
}

// Utils -----------------------------------------------------------------------

function configuredForges(options: SetupOptions): Exclude<Forge, 'none'>[] {
  const selected = options.forges ?? (options.forge && options.forge !== 'none' ? [options.forge] : []);
  return [...new Set(selected)];
}

function getTextList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getConfigSetupAction(
  name: string,
  result: { path: string; changed: boolean; existed: boolean; planned: boolean },
): SetupAction {
  if (!result.changed) return createSetupAction(name, 'ready', result.path);
  if (result.planned) return createSetupAction(name, 'planned', result.path);
  return createSetupAction(name, result.existed ? 'updated' : 'installed', result.path);
}

function createSetupAction(name: string, status: SetupStatus, detail: string): SetupAction {
  return { name, status, detail };
}

function reportProgress(options: SetupOptions, message: string): void {
  options.onProgress?.(message);
}

async function packageVersion(): Promise<string> {
  const source = await readFile(join(resolveBundledAgentsDir(), '..', 'package.json'), 'utf8');
  let value: { version?: unknown };
  try {
    value = JSON.parse(source) as { version?: unknown };
  } catch (error) {
    throw new Error('Cannot parse the installed @difflab/pi package metadata.', { cause: error });
  }
  if (typeof value.version !== 'string') throw new Error('Cannot resolve the installed @difflab/pi version.');
  return value.version;
}

function getRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
