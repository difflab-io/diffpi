/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import difflabPiExtension from '../extensions/index';
import {
  createModeController,
  discoverAgentModes,
  resolveAgentMode,
  type ModeCatalog,
  type ModeDiscoveryOptions,
  type ModeThinkingLevel,
} from '../src/modes';

type SessionEntry = { type: string; customType?: string; data?: unknown };
type TestModel = { provider: string; id: string };
type EventHandler = (...args: unknown[]) => unknown;

const model = (provider: string, id: string): TestModel => ({ provider, id });

function createContext(
  cwd: string,
  entries: SessionEntry[],
  statuses: Array<string | undefined>,
  models: TestModel[] = [],
  currentModel?: TestModel,
  trusted = true,
): ExtensionContext {
  return {
    cwd,
    model: currentModel,
    scopedModels: [],
    modelRegistry: {
      getAvailable: () => models,
      find: (provider: string, id: string) =>
        models.find((candidate) => candidate.provider === provider && candidate.id === id),
    },
    isProjectTrusted: () => trusted,
    sessionManager: { getBranch: () => entries },
    ui: {
      setStatus(_key: string, value: string | undefined) {
        statuses.push(value);
      },
    },
  } as unknown as ExtensionContext;
}

function createRuntime(entries: SessionEntry[], initialTools: string[], initialThinking: ModeThinkingLevel) {
  const tools = new Map<string, ToolDefinition>();
  const handlers = new Map<string, EventHandler[]>();
  const availableToolNames = new Set([
    ...initialTools,
    'read',
    'grep',
    'find',
    'bash',
    'edit',
    'write',
    'mcp',
    'mcp__docs_mcp_server',
    'ctx_execute',
    'ctx_execute_file',
    'ctx_search',
    'ctx_fetch_and_index',
    'web_search',
    'fetch_content',
  ]);
  const selectedModels: string[] = [];
  let activeTools = [...initialTools];
  let thinkingLevel = initialThinking;

  const api = {
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
      availableToolNames.add(tool.name);
    },
    registerCommand() {},
    appendEntry(customType: string, data?: unknown) {
      entries.push({ type: 'custom', customType, data });
    },
    sendUserMessage() {},
    on(event: string, handler: unknown) {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler as EventHandler);
      handlers.set(event, eventHandlers);
    },
    getAllTools: () => [...availableToolNames].map((name) => ({ name })),
    getActiveTools: () => [...activeTools],
    setActiveTools(next: string[]) {
      activeTools = [...next];
    },
    getThinkingLevel: () => thinkingLevel,
    setThinkingLevel(next: ModeThinkingLevel) {
      thinkingLevel = next;
    },
    async setModel(next: TestModel) {
      selectedModels.push(`${next.provider}/${next.id}`);
      return true;
    },
  } as unknown as ExtensionAPI;

  return {
    api,
    tools,
    handlers,
    selectedModels,
    getActiveTools: () => activeTools,
    getThinkingLevel: () => thinkingLevel,
  };
}

describe('inline agent modes', () => {
  it('discovers trusted agents and qualifies opt-in skill agents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-modes-'));
    const homeDir = join(root, 'home');
    const agentDir = join(homeDir, '.pi', 'agent');
    const cwd = join(root, 'project');
    const userAgent = join(agentDir, 'agents', 'reviewer.md');
    const projectAgent = join(cwd, '.pi', 'agents', 'reviewer.md');
    const specAgent = join(homeDir, '.agents', 'skills', 'spec', 'agents', 'planner.md');
    const exploreAgent = join(cwd, '.agents', 'skills', 'explore', 'agents', 'researcher.md');
    const configPath = join(homeDir, '.difflab', 'diffpi', 'config.yaml');

    for (const path of [userAgent, projectAgent, specAgent, exploreAgent, configPath]) {
      await mkdir(dirname(path), { recursive: true });
    }
    await writeFile(userAgent, '---\nprompt_mode: append\n---\nUser reviewer prompt.\n');
    await writeFile(projectAgent, '---\ndescription: Project reviewer\n---\nProject reviewer prompt.\n');
    await writeFile(specAgent, '# Planner\n\nSpec planning prompt.\n');
    await writeFile(exploreAgent, '---\nname: researcher\n---\nProject research prompt.\n');
    await writeFile(configPath, 'agents:\n  tutor:\n    models:\n      - meridian/claude-opus-5\n');

    const standard = await discoverAgentModes({ cwd, agentDir, homeDir, projectTrusted: true });
    const withSkills = await discoverAgentModes({
      cwd,
      agentDir,
      homeDir,
      projectTrusted: true,
      includeSkills: true,
    });
    const untrusted = await discoverAgentModes({
      cwd,
      agentDir,
      homeDir,
      projectTrusted: false,
      includeSkills: true,
    });
    const unspecifiedTrust = await discoverAgentModes({ cwd, agentDir, homeDir } as ModeDiscoveryOptions);
    const reviewer = standard.modes.find((candidate) => candidate.id === 'reviewer');

    expect(standard.modes.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(['tutor', 'copilot', 'worker']),
    );
    expect(standard.modes.map((candidate) => candidate.id)).not.toContain('planner');
    expect(standard.modes.map((candidate) => candidate.id)).not.toContain('orchestrator');
    expect(standard.modes.map((candidate) => candidate.id)).not.toContain('autonomous');
    expect(withSkills.modes.map((candidate) => candidate.id)).toContain('spec:planner');
    expect(withSkills.modes.map((candidate) => candidate.id)).toContain('explore:researcher');
    expect(standard.modes.find((candidate) => candidate.id === 'tutor')?.modelPreferences).toEqual([
      'meridian/claude-opus-5',
    ]);
    expect(reviewer?.systemPrompt).toBe('Project reviewer prompt.');
    expect(untrusted.modes.map((candidate) => candidate.id)).not.toContain('explore:researcher');
    expect(untrusted.modes.find((candidate) => candidate.id === 'reviewer')?.systemPrompt).toBe(
      'User reviewer prompt.',
    );
    expect(unspecifiedTrust.modes.find((candidate) => candidate.id === 'reviewer')?.systemPrompt).toBe(
      'User reviewer prompt.',
    );

    const exact = resolveAgentMode(withSkills.modes, 'spec:planner');
    expect(exact.ok && exact.active?.id).toBe('spec:planner');
  });

  it('propagates directory discovery failures other than missing paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-modes-errors-'));
    const bundledAgentsDir = join(root, 'bundled');
    const agentDir = join(root, 'not-a-directory');
    await mkdir(bundledAgentsDir);
    await writeFile(agentDir, 'file');

    expect(
      discoverAgentModes({ cwd: root, agentDir, bundledAgentsDir, homeDir: root, projectTrusted: false }),
    ).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('routes models, thinking, tools, prompts, and clear through the registered extension', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-runtime-'));
    const entries: SessionEntry[] = [];
    const statuses: Array<string | undefined> = [];
    const baselineModel = model('anthropic', 'claude-opus-4-6');
    const availableModels = [
      baselineModel,
      model('meridian', 'claude-haiku-4-5'),
      model('openai-codex', 'gpt-5.6-sol'),
    ];
    const runtime = createRuntime(entries, ['read', 'bash', 'edit', 'write'], 'high');
    const ctx = createContext(root, entries, statuses, availableModels, baselineModel);

    difflabPiExtension(runtime.api);

    const listResult = await runtime.tools.get('diffpi_modes_list')?.execute('list', {}, undefined, undefined, ctx);
    const listDetails = listResult?.details as { catalog?: ModeCatalog } | undefined;
    expect(listDetails?.catalog?.modes.map((candidate) => candidate.id)).toEqual(
      expect.arrayContaining(['tutor', 'copilot', 'worker']),
    );

    const workerResult = await runtime.tools
      .get('diffpi_modes_set')
      ?.execute('set-worker', { agent: 'worker' }, undefined, undefined, ctx);
    expect(runtime.selectedModels.at(-1)).toBe('meridian/claude-haiku-4-5');
    expect(runtime.getThinkingLevel()).toBe('low');
    expect(runtime.getActiveTools()).toEqual(expect.arrayContaining(['edit', 'write', 'ctx_execute']));
    expect(runtime.getActiveTools()).not.toContain('web_search');
    expect(runtime.getActiveTools()).not.toContain('mcp__docs_mcp_server');
    expect(workerResult?.content[0]).toMatchObject({ type: 'text' });

    await runtime.tools
      .get('diffpi_modes_set')
      ?.execute('set-copilot', { agent: 'copilot' }, undefined, undefined, ctx);
    expect(runtime.selectedModels.at(-1)).toBe('meridian/claude-haiku-4-5');
    expect(runtime.getThinkingLevel()).toBe('low');
    expect(runtime.getActiveTools()).toEqual(
      expect.arrayContaining(['edit', 'mcp__docs_mcp_server', 'ctx_search', 'web_search']),
    );

    await runtime.tools.get('diffpi_modes_set')?.execute('set-tutor', { agent: 'tutor' }, undefined, undefined, ctx);
    expect(runtime.selectedModels.at(-1)).toBe('openai-codex/gpt-5.6-sol');
    expect(runtime.getThinkingLevel()).toBe('medium');
    expect(runtime.getActiveTools()).toEqual(
      expect.arrayContaining(['mcp__docs_mcp_server', 'ctx_search', 'web_search', 'diffpi_modes_unset']),
    );
    expect(runtime.getActiveTools()).not.toContain('edit');

    const beforeStart = runtime.handlers.get('before_agent_start')?.at(-1);
    const tutorPrompt = (await beforeStart?.({ systemPrompt: 'BASE' }, ctx)) as { systemPrompt?: string } | undefined;
    expect(tutorPrompt?.systemPrompt).not.toContain('BASE');
    expect(tutorPrompt?.systemPrompt).toContain('technical tutor');
    expect(entries.at(-1)?.customType).toBe('diffpi-mode-state');
    expect(statuses.at(-1)).toBe('mode: tutor');

    await runtime.tools.get('diffpi_modes_unset')?.execute('unset', {}, undefined, undefined, ctx);
    expect(runtime.selectedModels.at(-1)).toBe('anthropic/claude-opus-4-6');
    expect(runtime.getThinkingLevel()).toBe('high');
    expect(runtime.getActiveTools()).toEqual(['read', 'bash', 'edit', 'write']);
    expect(statuses.at(-1)).toBeUndefined();
  });

  it('restores a complete profile snapshot after extension reload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-state-'));
    const entries: SessionEntry[] = [];
    const statuses: Array<string | undefined> = [];
    const baselineModel = model('anthropic', 'claude-opus-4-6');
    const availableModels = [baselineModel, model('openai-codex', 'gpt-5.6-luna')];
    const runtime = createRuntime(entries, ['read', 'bash', 'edit', 'write'], 'high');
    const ctx = createContext(root, entries, statuses, availableModels, baselineModel);
    const controller = createModeController(runtime.api, {
      agentDir: join(root, 'agent'),
      homeDir: join(root, 'home'),
    });

    const selected = await controller.set('copilot', ctx);
    expect(selected.ok).toBe(true);
    expect(runtime.selectedModels.at(-1)).toBe('openai-codex/gpt-5.6-luna');

    const restored = createModeController(runtime.api, {
      agentDir: join(root, 'agent'),
      homeDir: join(root, 'home'),
    });
    await restored.restore(ctx);
    expect(restored.getActive()?.id).toBe('copilot');
    expect(restored.apply('BASE PROMPT')).toContain('Active inline agent: Copilot');
    expect(runtime.getThinkingLevel()).toBe('low');

    await restored.unset(ctx);
    expect(restored.apply('BASE PROMPT')).toBe('BASE PROMPT');
    expect(runtime.selectedModels.at(-1)).toBe('anthropic/claude-opus-4-6');
  });
});
