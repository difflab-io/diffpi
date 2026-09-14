import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
// pi-mcp-adapter owns the client configuration schema.
import type { McpConfig, ServerEntry } from 'pi-mcp-adapter/types';

// Types -----------------------------------------------------------------------

export interface McpEnsureOptions {
  dryRun?: boolean;
  path?: string;
}

export interface McpEnsureResult {
  path: string;
  changed: boolean;
  existed: boolean;
  planned: boolean;
}

// Public API ------------------------------------------------------------------

export const mcp = {
  globalConfigPath(homeDir = homedir()): string {
    return join(homeDir, '.config', 'mcp', 'mcp.json');
  },

  async serversEnsure(
    servers: Readonly<Record<string, ServerEntry>>,
    options: McpEnsureOptions = {},
  ): Promise<McpEnsureResult> {
    const path = options.path ?? mcp.globalConfigPath();
    const currentText = await getOptionalFile(path);
    const current = getParsedConfig(currentText, path);
    const nextServers = { ...current.mcpServers };

    for (const [name, entry] of Object.entries(servers)) {
      nextServers[name] = mergeEntry(nextServers[name], entry);
    }

    const next: McpConfig = { ...current, mcpServers: nextServers };
    const changed = JSON.stringify(current) !== JSON.stringify(next);
    if (changed && !options.dryRun) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }

    return { path, changed, existed: currentText !== undefined, planned: changed && options.dryRun === true };
  },
};

// Utilities -------------------------------------------------------------------

function mergeEntry(current: ServerEntry | undefined, required: ServerEntry): ServerEntry {
  const merged: ServerEntry = { ...current, ...required };
  if (current?.env || required.env) merged.env = { ...current?.env, ...required.env };
  return merged;
}

function getParsedConfig(content: string | undefined, path: string): McpConfig {
  if (!content?.trim()) return { mcpServers: {} };

  try {
    const value: unknown = JSON.parse(content);
    if (!isRecord(value)) throw new Error('not an object');
    const servers = value.mcpServers;
    if (servers !== undefined && !isRecord(servers)) throw new Error('mcpServers is not an object');
    return { ...value, mcpServers: (servers ?? {}) as Record<string, ServerEntry> };
  } catch {
    throw new Error(`Expected a valid pi-mcp-adapter configuration in ${path}.`);
  }
}

async function getOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
