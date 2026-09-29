/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import {
  DefaultResourceLoader,
  SettingsManager,
  createAgentSession,
  SessionManager,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';
import { cp, mkdir, mkdtemp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(import.meta.dir, '..');

describe('native package catalog', () => {
  it('discovers every bundled skill through the package manifest', async () => {
    const manifest = await Bun.file(join(root, 'package.json')).json();
    expect(manifest.pi.skills).toEqual(['./skills']);
    expect(manifest.pi.extensions).toEqual(['./dist/extensions/index.js']);
    const expected = (await readdir(join(root, 'skills'), { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
    expect(expected).not.toContain('mode');
    await stat(join(root, 'dist/extensions/index.js'));
    const settingsManager = SettingsManager.inMemory({ packages: [root] });
    const loader = new DefaultResourceLoader({ cwd: import.meta.dir, agentDir: getAgentDir(), settingsManager });
    await loader.reload();
    const names = loader.getSkills().skills.map((item) => item.name);
    for (const name of expected) expect(names.filter((loaded) => loaded === name)).toHaveLength(1);
    expect(loader.getExtensions().extensions.some((item) => item.path.endsWith('/dist/extensions/index.js'))).toBe(
      true,
    );
    const { session, extensionsResult } = await createAgentSession({
      cwd: import.meta.dir,
      resourceLoader: loader,
      settingsManager,
      sessionManager: SessionManager.inMemory(import.meta.dir),
    });
    try {
      expect(extensionsResult.errors).toEqual([]);
      const tools = session.agent.state.tools.map((tool) => tool.name);
      expect(tools).toEqual(expect.arrayContaining(['read', 'bash', 'edit', 'write', 'plan_verify', 'review_context']));
      expect(tools.some((tool) => tool.startsWith('diffpi_modes_'))).toBe(false);
    } finally {
      session.dispose();
    }
  });

  it('passes ambient resources to child and grandchild profiles when the installed plugin is available', async () => {
    const plugin = join(getAgentDir(), 'npm/node_modules/@tintinweb/pi-subagents/src/custom-agents.ts');
    try {
      await stat(plugin);
    } catch {
      return;
    } // Optional host plugin is not a package runtime dependency.
    const project = await mkdtemp(join(tmpdir(), 'diffpi-nested-catalog-'));
    const target = join(project, '.pi/agents');
    await mkdir(target, { recursive: true });
    for (const file of (await readdir(join(root, 'agents'))).filter((name) => name.endsWith('.md')))
      await cp(join(root, 'agents', file), join(target, file));
    const { loadCustomAgents } = await import(plugin);
    const configs = loadCustomAgents(project, true);
    for (const type of [
      'diffpi-planner',
      'diffpi-orchestrator',
      'diffpi-plan-reviewer',
      'diffpi-reviewer',
      'diffpi-worker',
    ]) {
      const config = configs.get(type);
      expect(config?.allowedSubagents).toBe('all');
      expect(config?.extensions).toBe(true);
      expect(config?.skills).toBe(true);
      expect(config?.disallowedTools).toBeUndefined();
      expect(config?.extSelectors).toBeUndefined();
      expect(config?.builtinToolNames).toContain('write');
    }
    // The planner's configured frontier model must not lock the caller's high/low thinking override.
    expect(configs.get('diffpi-planner')?.model).toBe('openai-codex/gpt-5.6-sol');
    expect(configs.get('diffpi-planner')?.thinking).toBeUndefined();
    expect(configs.get('diffpi-orchestrator')?.thinking).toBe('medium');
    expect(configs.get('diffpi-worker')?.thinking).toBe('low');
    // Plugin default max depth 2 permits a main → child → grandchild chain.
    const { getMaxSubagentDepth } = await import(
      join(getAgentDir(), 'npm/node_modules/@tintinweb/pi-subagents/src/nested-tools.ts')
    );
    expect(getMaxSubagentDepth()).toBeGreaterThanOrEqual(2);
  });
});
