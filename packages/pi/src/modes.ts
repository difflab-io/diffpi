import {
  getAgentDir,
  parseFrontmatter,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { resolveBundledAgentsDir } from './assets';
import { findPreferredModel, loadDiffpiConfig, resolveAgentModelPreferences } from './config';
import { readDirectoryIfExists } from './fsx';

// Types -----------------------------------------------------------------------

export type ModePromptStrategy = 'append' | 'replace';
export type ModeThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AgentMode {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;
  promptStrategy: ModePromptStrategy;
  modelPreferences: string[];
  thinkingLevel?: ModeThinkingLevel;
  tools: string[];
  source: string;
  sourcePath: string;
}

export interface ModeCatalog {
  modes: AgentMode[];
  diagnostics: string[];
}

export interface ModeListOptions {
  includeSkills?: boolean;
}

export interface ModeController {
  list(ctx: ExtensionContext, options?: ModeListOptions): Promise<ModeCatalog>;
  set(agent: string, ctx: ExtensionContext): Promise<ModeSelectionResult>;
  unset(ctx: ExtensionContext): Promise<ModeSelectionResult>;
  restore(ctx: ExtensionContext): Promise<void>;
  apply(systemPrompt: string): string;
  getActive(): AgentMode | undefined;
}

export type ModeSelectionResult = { ok: true; active?: AgentMode; message: string } | { ok: false; message: string };

export interface ModeDiscoveryOptions extends ModeListOptions {
  cwd: string;
  agentDir?: string;
  bundledAgentsDir?: string;
  homeDir?: string;
  projectTrusted: boolean;
}

export interface ModeControllerOptions {
  agentDir?: string;
  bundledAgentsDir?: string;
  homeDir?: string;
}

type ModeRuntime = Pick<
  ExtensionAPI,
  | 'appendEntry'
  | 'getActiveTools'
  | 'getAllTools'
  | 'getThinkingLevel'
  | 'setActiveTools'
  | 'setModel'
  | 'setThinkingLevel'
>;

type ModeBaseline = {
  model?: { provider: string; id: string };
  thinkingLevel: ModeThinkingLevel;
  tools: string[];
};

type AgentFrontmatter = Record<string, unknown> & {
  name?: unknown;
  display_name?: unknown;
  description?: unknown;
  prompt_mode?: unknown;
  model?: unknown;
  model_fallbacks?: unknown;
  thinking?: unknown;
  tools?: unknown;
  enabled?: unknown;
  inline?: unknown;
};

type ModeStateEntry = {
  type: string;
  customType?: string;
  data?: { active?: unknown; baseline?: unknown };
};

// Public API ------------------------------------------------------------------

/** Discover standard agents and, when requested, qualified skill agents. */
export async function discoverAgentModes(options: ModeDiscoveryOptions): Promise<ModeCatalog> {
  const agentDir = options.agentDir ?? getAgentDir();
  const homeDir = options.homeDir ?? homedir();
  const modes = new Map<string, AgentMode>();
  const diagnostics: string[] = [];

  await loadAgentModes(options.bundledAgentsDir ?? BUNDLED_AGENTS_DIR, 'diffpi agent', modes, diagnostics);
  await loadAgentModes(join(agentDir, 'agents'), 'user agent', modes, diagnostics);

  if (options.includeSkills) {
    await loadSkillModes(join(homeDir, '.agents', 'skills'), 'user skill', modes, diagnostics);
    await loadSkillModes(join(agentDir, 'skills'), 'pi user skill', modes, diagnostics);
  }

  if (options.projectTrusted === true) {
    if (options.includeSkills) {
      await loadSkillModes(join(options.cwd, '.agents', 'skills'), 'project skill', modes, diagnostics);
      await loadSkillModes(join(options.cwd, '.pi', 'skills'), 'pi project skill', modes, diagnostics);
    }
    await loadAgentModes(join(options.cwd, '.agents', 'agents'), 'project agent', modes, diagnostics);
    await loadAgentModes(join(options.cwd, '.pi', 'agents'), 'pi project agent', modes, diagnostics);
  }

  const userConfig = await loadDiffpiConfig({ homeDir });
  const configuredModes = [...modes.values()].map((mode) => ({
    ...mode,
    modelPreferences: resolveAgentModelPreferences(mode.id, mode.modelPreferences, userConfig.config),
  }));

  return {
    modes: configuredModes.sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  };
}

/** Resolve an agent id without guessing an unqualified skill-agent name. */
export function resolveAgentMode(modes: readonly AgentMode[], requested: string): ModeSelectionResult {
  const name = requested.trim();
  if (!name) return { ok: false, message: 'Agent name is required.' };

  const exact = modes.find((mode) => mode.id === name);
  if (exact) return { ok: true, active: exact, message: `Active inline agent: ${exact.id}.` };

  const lowerName = name.toLowerCase();
  const matches = modes.filter((mode) => mode.id.toLowerCase() === lowerName);
  if (matches.length === 1) {
    const active = matches[0];
    return { ok: true, active, message: `Active inline agent: ${active.id}.` };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      message: `Inline agent "${name}" is ambiguous. Use one of: ${matches.map((mode) => mode.id).join(', ')}.`,
    };
  }

  return { ok: false, message: `Unknown inline agent "${name}". Run /skill:mode or diffpi_modes_list.` };
}

/** Create the session-scoped controller that applies and restores complete mode profiles. */
export function createModeController(pi: ModeRuntime, options: ModeControllerOptions = {}): ModeController {
  let active: AgentMode | undefined;
  let baseline: ModeBaseline | undefined;

  const updateStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus(MODE_STATUS_KEY, active ? `mode: ${active.id}` : undefined);
  };

  const list = (ctx: ExtensionContext, listOptions: ModeListOptions = {}) =>
    discoverAgentModes({
      cwd: ctx.cwd,
      agentDir: options.agentDir,
      bundledAgentsDir: options.bundledAgentsDir,
      homeDir: options.homeDir,
      projectTrusted: ctx.isProjectTrusted(),
      includeSkills: listOptions.includeSkills,
    });

  return {
    list,

    async set(agent, ctx) {
      const catalog = await list(ctx, { includeSkills: agent.includes(':') });
      const result = resolveAgentMode(catalog.modes, agent);
      if (!result.ok || !result.active) return result;

      baseline ??= captureRuntime(pi, ctx);
      if (active && baseline) await restoreRuntime(pi, baseline, ctx);
      active = result.active;
      const runtimeMessage = await applyModeRuntime(pi, active, ctx);
      pi.appendEntry(MODE_STATE_ENTRY, { active, baseline });
      updateStatus(ctx);
      return { ...result, message: `${result.message} ${runtimeMessage}` };
    },

    async unset(ctx) {
      if (!active) return { ok: true, message: 'Inline agent is already clear.' };
      if (baseline) await restoreRuntime(pi, baseline, ctx);
      active = undefined;
      pi.appendEntry(MODE_STATE_ENTRY, { active: null });
      baseline = undefined;
      updateStatus(ctx);
      return { ok: true, message: 'Inline agent cleared. The previous model, thinking, tools, and prompt resume.' };
    },

    async restore(ctx) {
      const previousActive = active;
      const previousBaseline = baseline;
      const entry = [...ctx.sessionManager.getBranch()]
        .reverse()
        .find((candidate) => candidate.type === 'custom' && candidate.customType === MODE_STATE_ENTRY) as
        ModeStateEntry | undefined;
      const restored = entry?.data?.active;
      const restoredBaseline = entry?.data?.baseline;

      if (isAgentModeSnapshot(restored)) {
        active = restored;
        baseline = isModeBaseline(restoredBaseline) ? restoredBaseline : previousBaseline;
        await applyModeRuntime(pi, active, ctx);
      } else {
        // Pi restores model and thinking entries during tree navigation. Tool state is extension-owned.
        if (previousActive && previousBaseline) pi.setActiveTools(previousBaseline.tools);
        active = undefined;
        baseline = undefined;
      }
      updateStatus(ctx);
    },

    apply(systemPrompt) {
      if (!active) return systemPrompt;
      if (active.promptStrategy === 'replace') return active.systemPrompt;
      return `${systemPrompt}\n\n## Active inline agent: ${active.label}\n\n${active.systemPrompt}`;
    },

    getActive() {
      return active;
    },
  };
}

// Constants -------------------------------------------------------------------

const MODE_STATE_ENTRY = 'diffpi-mode-state';
const MODE_STATUS_KEY = 'diffpi-mode';
const MODE_CONTROL_TOOLS = ['ask_user_question', 'diffpi_modes_list', 'diffpi_modes_set', 'diffpi_modes_unset'];
const BUNDLED_AGENTS_DIR = resolveBundledAgentsDir();
const THINKING_LEVELS = new Set<ModeThinkingLevel>(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

// Core ------------------------------------------------------------------------

async function applyModeRuntime(pi: ModeRuntime, mode: AgentMode, ctx: ExtensionContext): Promise<string> {
  let selectedModel: string | undefined;
  if (mode.modelPreferences.length > 0) {
    const scoped = ctx.scopedModels.length > 0 ? ctx.scopedModels.map((entry) => entry.model) : undefined;
    const availableModels = scoped ?? ctx.modelRegistry.getAvailable();
    for (const preference of mode.modelPreferences) {
      const model = findPreferredModel(availableModels, preference);
      if (model && (await pi.setModel(model))) {
        selectedModel = `${model.provider}/${model.id}`;
        break;
      }
    }
  }

  if (mode.thinkingLevel) pi.setThinkingLevel(mode.thinkingLevel);

  if (mode.tools.length > 0) {
    const availableTools = new Set(pi.getAllTools().map((tool) => tool.name));
    const selectedTools = [...new Set([...mode.tools, ...MODE_CONTROL_TOOLS])].filter((tool) =>
      availableTools.has(tool),
    );
    if (selectedTools.length > 0) pi.setActiveTools(selectedTools);
  }

  const parts: string[] = [];
  if (mode.modelPreferences.length > 0) {
    parts.push(
      selectedModel ? `Model: ${selectedModel}.` : 'No preferred model was available; kept the current model.',
    );
  }
  if (mode.thinkingLevel) parts.push(`Thinking: ${mode.thinkingLevel}.`);
  if (mode.tools.length > 0) parts.push('Applied the profile tool set.');
  return parts.join(' ') || 'The profile changes the prompt only.';
}

async function restoreRuntime(pi: ModeRuntime, state: ModeBaseline, ctx: ExtensionContext): Promise<void> {
  if (state.model) {
    const model = ctx.modelRegistry.find(state.model.provider, state.model.id);
    if (model) await pi.setModel(model);
  }
  pi.setThinkingLevel(state.thinkingLevel);
  pi.setActiveTools(state.tools);
}

function captureRuntime(pi: ModeRuntime, ctx: ExtensionContext): ModeBaseline {
  return {
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
    thinkingLevel: pi.getThinkingLevel(),
    tools: pi.getActiveTools(),
  };
}

async function loadSkillModes(
  skillsDir: string,
  source: string,
  modes: Map<string, AgentMode>,
  diagnostics: string[],
): Promise<void> {
  const entries = await readDirectoryIfExists(skillsDir);
  for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    await loadAgentModes(
      join(skillsDir, entry.name, 'agents'),
      `${source} ${entry.name}`,
      modes,
      diagnostics,
      entry.name,
    );
  }
}

async function loadAgentModes(
  directory: string,
  source: string,
  modes: Map<string, AgentMode>,
  diagnostics: string[],
  skillName?: string,
): Promise<void> {
  const entries = await readDirectoryIfExists(directory);
  for (const entry of entries
    .filter((item) => item.isFile() && item.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    try {
      const content = await readFile(path, 'utf8');
      const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(
        content.startsWith('\uFEFF') ? content.slice(1) : content,
      );
      if (frontmatter.enabled === false || frontmatter.inline === false) continue;

      const name = getFrontmatterText(frontmatter.name) ?? basename(path, extname(path));
      const systemPrompt = body.trim();
      if (!name || name.includes(':') || !systemPrompt) {
        diagnostics.push(`Skipped ${path}: agent name must not contain ":" and prompt body is required.`);
        continue;
      }

      const id = skillName ? `${skillName}:${name}` : name;
      modes.set(id, {
        id,
        label: getFrontmatterText(frontmatter.display_name) ?? name,
        description: getFrontmatterText(frontmatter.description) ?? `Inline agent from ${basename(path)}`,
        systemPrompt,
        promptStrategy: frontmatter.prompt_mode === 'append' ? 'append' : 'replace',
        modelPreferences: [
          ...getFrontmatterList(frontmatter.model),
          ...getFrontmatterList(frontmatter.model_fallbacks),
        ],
        thinkingLevel: getThinkingLevel(frontmatter.thinking),
        tools: getFrontmatterList(frontmatter.tools),
        source,
        sourcePath: path,
      });
    } catch (error) {
      diagnostics.push(`Skipped ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Utils -----------------------------------------------------------------------

/** Normalize an untrusted frontmatter field to non-empty text. */
function getFrontmatterText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getFrontmatterList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getThinkingLevel(value: unknown): ModeThinkingLevel | undefined {
  const level = getFrontmatterText(value) as ModeThinkingLevel | undefined;
  return level && THINKING_LEVELS.has(level) ? level : undefined;
}

function isAgentModeSnapshot(value: unknown): value is AgentMode {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentMode>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.systemPrompt === 'string' &&
    (candidate.promptStrategy === 'append' || candidate.promptStrategy === 'replace') &&
    Array.isArray(candidate.modelPreferences) &&
    (candidate.thinkingLevel === undefined || THINKING_LEVELS.has(candidate.thinkingLevel)) &&
    Array.isArray(candidate.tools) &&
    typeof candidate.source === 'string' &&
    typeof candidate.sourcePath === 'string'
  );
}

function isModeBaseline(value: unknown): value is ModeBaseline {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ModeBaseline>;
  const model = candidate.model;
  return (
    (model === undefined || (typeof model.provider === 'string' && typeof model.id === 'string')) &&
    candidate.thinkingLevel !== undefined &&
    THINKING_LEVELS.has(candidate.thinkingLevel) &&
    Array.isArray(candidate.tools) &&
    candidate.tools.every((tool) => typeof tool === 'string')
  );
}

// End of mode helpers.
