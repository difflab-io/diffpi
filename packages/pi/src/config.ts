import { parseFrontmatter } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readTextIfExists } from './fsx';

// Types -----------------------------------------------------------------------

export interface DiffpiAgentConfig {
  models?: string[];
}

export interface DiffpiConfig {
  agents?: Record<string, DiffpiAgentConfig>;
}

export interface LoadedDiffpiConfig {
  config: DiffpiConfig;
  path?: string;
}

export interface DiffpiConfigPaths {
  yaml: string;
  json: string;
}

// Schemas ---------------------------------------------------------------------

const modelReferenceSchema = z.string().trim().min(1);
const agentConfigSchema = z
  .object({
    models: z.array(modelReferenceSchema).optional(),
  })
  .strict();
const diffpiConfigSchema = z
  .object({
    agents: z.record(z.string(), agentConfigSchema).optional(),
  })
  .strict();

// Public API ------------------------------------------------------------------

/** Resolve supported user-level Diffpi configuration paths. */
export function diffpiConfigPaths(homeDir = homedir()): DiffpiConfigPaths {
  const directory = join(homeDir, '.difflab', 'diffpi');
  return {
    yaml: join(directory, 'config.yaml'),
    json: join(directory, 'config.json'),
  };
}

/** Load the first user configuration file in YAML-then-JSON precedence order. */
export async function loadDiffpiConfig(options: { homeDir?: string } = {}): Promise<LoadedDiffpiConfig> {
  const paths = diffpiConfigPaths(options.homeDir);
  for (const [format, path] of [
    ['yaml', paths.yaml],
    ['json', paths.json],
  ] as const) {
    const content = await readTextIfExists(path);
    if (content === undefined) continue;

    try {
      const value = format === 'yaml' ? parseYamlConfig(content) : JSON.parse(content);
      return { config: diffpiConfigSchema.parse(value ?? {}), path };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid Diffpi config at ${path}: ${reason}`, { cause: error });
    }
  }

  return { config: {} };
}

function parseYamlConfig(content: string): Record<string, unknown> {
  const document = content.replace(/^\uFEFF/, '').replace(/^---[^\S\r\n]*(?:#.*)?(?:\r?\n|$)/, '');
  return parseFrontmatter<Record<string, unknown>>(`---\n${document}\n---\n`).frontmatter;
}

/** Apply an optional per-agent user preference list over bundled defaults. */
export function resolveAgentModelPreferences(
  agentId: string,
  profilePreferences: readonly string[],
  config: DiffpiConfig,
): string[] {
  const override = config.agents?.[agentId];
  if (override && Object.hasOwn(override, 'models')) return [...(override.models ?? [])];
  return [...profilePreferences];
}

/** Find one preferred model using exact references, exact ids, then normalized tokens. */
export function findPreferredModel<T extends { provider: string; id: string }>(
  models: readonly T[],
  preference: string,
): T | undefined {
  const normalizedPreference = normalizeModelReference(preference);
  const exactReference = models.find(
    (model) => normalizeModelReference(`${model.provider}/${model.id}`) === normalizedPreference,
  );
  if (exactReference) return exactReference;

  const idPreference = preference.includes('/') ? preference.slice(preference.indexOf('/') + 1) : preference;
  const normalizedIdPreference = normalizeModelReference(idPreference);
  const exactId = models.find((model) => normalizeModelReference(model.id) === normalizedIdPreference);
  if (exactId) return exactId;

  const preferenceTokens = normalizedIdPreference.split('-').filter(Boolean);
  return models.find((model) => {
    const modelTokens = new Set(normalizeModelReference(model.id).split('-').filter(Boolean));
    return preferenceTokens.every((token) => modelTokens.has(token));
  });
}

function normalizeModelReference(value: string): string {
  return value
    .toLowerCase()
    .replace(/^~/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
