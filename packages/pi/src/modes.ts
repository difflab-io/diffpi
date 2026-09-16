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
import { readDirectoryIfExists } from './fsx';

// Types -----------------------------------------------------------------------

export type ModePromptStrategy = 'append' | 'replace';

export interface AgentMode {
  id: string;
  label: string;
  description: string;
  systemPrompt: string;
  promptStrategy: ModePromptStrategy;
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
  unset(ctx: ExtensionContext): ModeSelectionResult;
  restore(ctx: ExtensionContext): void;
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

type AgentFrontmatter = Record<string, unknown> & {
  name?: unknown;
  display_name?: unknown;
  description?: unknown;
  prompt_mode?: unknown;
  enabled?: unknown;
};

type ModeStateEntry = {
  type: string;
  customType?: string;
  data?: { active?: unknown };
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

  return {
    modes: [...modes.values()].sort((left, right) => left.id.localeCompare(right.id)),
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

/** Create the session-scoped controller that selects, restores, and applies modes. */
export function createModeController(
  pi: Pick<ExtensionAPI, 'appendEntry'>,
  options: ModeControllerOptions = {},
): ModeController {
  let active: AgentMode | undefined;

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

      active = result.active;
      pi.appendEntry(MODE_STATE_ENTRY, { active });
      updateStatus(ctx);
      return result;
    },

    unset(ctx) {
      if (!active) return { ok: true, message: 'Inline agent is already clear.' };
      active = undefined;
      pi.appendEntry(MODE_STATE_ENTRY, { active: null });
      updateStatus(ctx);
      return { ok: true, message: 'Inline agent cleared. Default Pi behavior resumes on the next turn.' };
    },

    restore(ctx) {
      const entry = [...ctx.sessionManager.getBranch()]
        .reverse()
        .find((candidate) => candidate.type === 'custom' && candidate.customType === MODE_STATE_ENTRY) as
        ModeStateEntry | undefined;
      const restored = entry?.data?.active;
      active = isAgentModeSnapshot(restored) ? restored : undefined;
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
const BUNDLED_AGENTS_DIR = resolveBundledAgentsDir();

// Core ------------------------------------------------------------------------

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
      if (frontmatter.enabled === false) continue;

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

function isAgentModeSnapshot(value: unknown): value is AgentMode {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AgentMode>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.systemPrompt === 'string' &&
    (candidate.promptStrategy === 'append' || candidate.promptStrategy === 'replace') &&
    typeof candidate.source === 'string' &&
    typeof candidate.sourcePath === 'string'
  );
}
