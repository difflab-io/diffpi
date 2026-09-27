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

// Test fixtures ---------------------------------------------------------------

type SessionEntry = { type: string; customType?: string; data?: unknown };
type TestModel = { provider: string; id: string };
type EventHandler = (...args: unknown[]) => unknown;
type CommandHandler = { handler: (args: string, ctx: ExtensionContext) => Promise<void> };

const model = (provider: string, id: string): TestModel => ({ provider, id });

function createContext(
  cwd: string,
  entries: SessionEntry[],
  statuses: Array<string | undefined>,
  models: TestModel[] = [],
  currentModel?: TestModel,
  trusted = true,
  selectedMode?: string,
  notifications: string[] = [],
  widgets: string[] = [],
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
      async select() {
        return selectedMode;
      },
      notify(message: string) {
        notifications.push(message);
      },
      setWidget(_key: string, lines: string[] | undefined) {
        if (lines?.[0]) widgets.push(lines[0]);
      },
    },
  } as unknown as ExtensionContext;
}

function createRuntime(
  entries: SessionEntry[],
  initialTools: string[],
  initialThinking: ModeThinkingLevel,
  omittedTools: string[] = [],
) {
  const tools = new Map<string, ToolDefinition>();
  const handlers = new Map<string, EventHandler[]>();
  const commands = new Map<string, CommandHandler>();
  const availableToolNames = new Set(
    [
      ...initialTools,
      'Agent',
      'get_subagent_result',
      'steer_subagent',
      'ask_user_question',
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
    ].filter((name) => !omittedTools.includes(name)),
  );
  const selectedModels: string[] = [];
  const sentMessages: unknown[] = [];
  const sentUserMessages: string[] = [];
  type RpcEventData = { requestId: string; type?: string; options?: unknown; prompt?: string };
  const rpcRequests: Array<{ event: string; data: RpcEventData }> = [];
  const eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  const events = {
    on(event: string, handler: (data: unknown) => void) {
      const set = eventHandlers.get(event) ?? new Set();
      set.add(handler);
      eventHandlers.set(event, set);
      return () => set.delete(handler);
    },
    emit(event: string, data: unknown) {
      const payload = data as RpcEventData;
      if (event.startsWith('subagents:rpc:')) rpcRequests.push({ event, data: payload });
      if (event === 'subagents:rpc:ping') {
        for (const handler of eventHandlers.get(`subagents:rpc:ping:reply:${payload.requestId}`) ?? [])
          handler({ success: true, data: { version: 2 } });
      }
      if (event === 'subagents:rpc:spawn') {
        for (const handler of eventHandlers.get(`subagents:rpc:spawn:reply:${payload.requestId}`) ?? [])
          handler({ success: true, data: { id: 'integration-agent-1' } });
      }
      for (const handler of eventHandlers.get(event) ?? []) handler(data);
    },
  };
  let activeTools = [...initialTools];
  let thinkingLevel = initialThinking;

  const api = {
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
      availableToolNames.add(tool.name);
    },
    registerCommand(name: string, command: CommandHandler) {
      commands.set(name, command);
    },
    appendEntry(customType: string, data?: unknown) {
      entries.push({ type: 'custom', customType, data });
    },
    sendMessage(message: unknown) {
      sentMessages.push(message);
    },
    async sendUserMessage(content: string) {
      sentUserMessages.push(content);
    },
    events,
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
    commands,
    selectedModels,
    sentMessages,
    sentUserMessages,
    rpcRequests,
    getActiveTools: () => activeTools,
    getThinkingLevel: () => thinkingLevel,
  };
}

// Inline agent modes ----------------------------------------------------------

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
    expect(standard.modes.map((candidate) => candidate.id)).toContain('planner');
    expect(standard.modes.find((candidate) => candidate.id === 'planner')?.tools).toEqual(
      expect.arrayContaining(['Agent', 'get_subagent_result', 'read', 'write', 'edit']),
    );
    expect(
      standard.modes.find((candidate) => candidate.id === 'planner')?.tools?.some((tool) => tool.startsWith('plan_')),
    ).toBe(false);
    expect(standard.modes.find((candidate) => candidate.id === 'worker')?.tools).not.toContain('Agent');
    expect(
      standard.modes.find((candidate) => candidate.id === 'worker')?.tools?.some((tool) => tool.startsWith('plan_')),
    ).toBe(false);
    expect(standard.modes.map((candidate) => candidate.id)).toContain('orchestrator');
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

  it('selects and clears a profile through the direct mode command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-command-'));
    const entries: SessionEntry[] = [];
    const statuses: Array<string | undefined> = [];
    const notifications: string[] = [];
    const availableModels = [model('openai-codex', 'gpt-5.6-luna')];
    const runtime = createRuntime(entries, ['read', 'bash', 'edit', 'write'], 'high');
    const ctx = createContext(root, entries, statuses, availableModels, undefined, true, 'worker', notifications);

    difflabPiExtension(runtime.api);
    await runtime.commands.get('mode')?.handler('', ctx);
    expect(runtime.selectedModels.at(-1)).toBe('openai-codex/gpt-5.6-luna');
    expect(notifications.at(-1)).toContain('Active inline agent: worker.');

    await runtime.commands.get('mode')?.handler('clear', ctx);
    expect(notifications.at(-1)).toContain('Inline agent cleared.');

    await runtime.commands.get('mode')?.handler('worker', ctx);
    await runtime.commands.get('mode')?.handler('default', ctx);
    expect(notifications.at(-1)).toContain('Inline agent cleared.');
  });

  it('forwards review arguments to the review skill without changing mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-review-routing-'));
    const entries: SessionEntry[] = [];
    const statuses: Array<string | undefined> = [];
    const baselineModel = model('openai-codex', 'gpt-5.6-terra');
    const runtime = createRuntime(entries, ['read', 'bash', 'edit', 'write'], 'high');
    const ctx = createContext(root, entries, statuses, [baselineModel], baselineModel);

    difflabPiExtension(runtime.api);
    const review = runtime.commands.get('review');
    await review?.handler('address --local --bg', ctx);
    expect(runtime.selectedModels).toEqual([]);
    expect(runtime.sentUserMessages).toEqual(['/skill:review address --local --bg']);
  });

  it('refreshes the visible agent badge after a manual model change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-model-'));
    const entries: SessionEntry[] = [];
    const statuses: Array<string | undefined> = [];
    const widgets: string[] = [];
    const terra = model('openai-codex', 'gpt-5.6-terra');
    const sol = model('openai-codex', 'gpt-5.6-sol');
    const runtime = createRuntime(entries, ['read', 'bash', 'edit', 'write'], 'high');
    const ctx = createContext(root, entries, statuses, [terra, sol], terra, true, undefined, [], widgets);

    difflabPiExtension(runtime.api);
    await runtime.handlers.get('session_start')?.at(-1)?.({}, ctx);
    expect(widgets.at(-1)).toContain('gpt-5.6-terra');

    (ctx as unknown as { model?: TestModel }).model = sol;
    await runtime.handlers.get('model_select')?.at(-1)?.({}, ctx);
    expect(widgets.at(-1)).toContain('gpt-5.6-sol');
  });

  it('routes models, thinking, tools, prompts, and clear through the registered extension', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-runtime-'));
    const projectAgents = join(root, '.pi', 'agents');
    await mkdir(projectAgents, { recursive: true });
    await writeFile(
      join(projectAgents, 'worker.md'),
      await Bun.file(join(import.meta.dir, '..', 'agents', 'diffpi-worker.md')).text(),
    );
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
    expect(runtime.getActiveTools()).not.toContain('Agent');
    // The mode picker retains its question tool even when Worker policy forbids background questions.
    expect(runtime.getActiveTools()).toContain('ask_user_question');
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
    expect(statuses.at(-1)).toBeUndefined();

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

  it('rolls back a failed profile switch without a ghost active badge', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-rollback-'));
    const homeDir = join(root, 'home');
    const agentDir = join(homeDir, '.pi', 'agent', 'agents');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'good.md'), '---\nname: good\n---\nGood prompt');
    await writeFile(join(agentDir, 'bad.md'), '---\nname: bad\nrequired_tools: [never-registered]\n---\nBad prompt');
    const entries: SessionEntry[] = [];
    const baseline = model('anthropic', 'claude-opus-4-6');
    const runtime = createRuntime(entries, ['read', 'write'], 'high');
    const ctx = createContext(root, entries, [undefined], [baseline], baseline);
    const controller = createModeController(runtime.api, {
      agentDir: join(homeDir, '.pi', 'agent'),
      bundledAgentsDir: join(root, 'none'),
      homeDir,
    });

    const good = await controller.set('good', ctx);
    expect(good.ok).toBe(true);
    const failed = await controller.set('bad', ctx);
    expect(failed.ok).toBe(false);
    expect(controller.getActive()?.id).toBe('good');
    expect(runtime.getActiveTools()).toEqual(expect.arrayContaining(['read', 'write']));
    expect(entries.at(-1)?.data).toMatchObject({ active: expect.objectContaining({ id: 'good' }) });
  });

  it('reports stale required capabilities until the next turn updates the model', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-status-'));
    const homeDir = join(root, 'home');
    const agentDir = join(homeDir, '.pi', 'agent', 'agents');
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, 'strict.md'),
      '---\nname: strict\nmodel: openai-codex/gpt-5.6-luna\nthinking: high\ntools: read, Agent\nrequired_tools: read, Agent\nrequired_model: true\nrequired_thinking: true\n---\nStrict prompt',
    );
    const entries: SessionEntry[] = [];
    const oldModel = model('anthropic', 'claude-opus-4-6');
    const selectedModel = model('openai-codex', 'gpt-5.6-luna');
    const runtime = createRuntime(entries, ['read', 'Agent'], 'high');
    const ctx = createContext(root, entries, [undefined], [oldModel, selectedModel], oldModel);
    const controller = createModeController(runtime.api, {
      agentDir: join(homeDir, '.pi', 'agent'),
      bundledAgentsDir: join(root, 'none'),
      homeDir,
    });

    const selected = await controller.set('strict', ctx);
    expect(selected.ok).toBe(true);

    const statusTool = (await import('../src/tools/modes'))
      .createModeTools(controller)
      .find((tool) => tool.name === 'diffpi_modes_status');
    const stale = await statusTool?.execute('status', {}, undefined, undefined, ctx);
    expect((stale?.details as { capabilityError?: string }).capabilityError).toContain(
      'requested model was not active',
    );
    (ctx as unknown as { model?: TestModel }).model = selectedModel;
    const clean = await statusTool?.execute('status-clean', {}, undefined, undefined, ctx);
    expect((clean?.details as { capabilityError?: string }).capabilityError).toBeUndefined();
  });

  it('blocks a strict profile without Agent and leaves no active ghost', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-agent-'));
    const homeDir = join(root, 'home');
    const agentDir = join(homeDir, '.pi', 'agent', 'agents');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'strict.md'), '---\nname: strict\nrequired_tools: read, Agent\n---\nStrict prompt');
    const entries: SessionEntry[] = [];
    const baseline = model('anthropic', 'claude-opus-4-6');
    const runtime = createRuntime(entries, ['read'], 'high', ['Agent']);
    const ctx = createContext(root, entries, [undefined], [baseline], baseline);
    const controller = createModeController(runtime.api, {
      agentDir: join(homeDir, '.pi', 'agent'),
      bundledAgentsDir: join(root, 'none'),
      homeDir,
    });

    const result = await controller.set('strict', ctx);
    expect(result).toEqual({ ok: false, message: expect.stringContaining('missing required tools [Agent]') });
    expect(controller.getActive()).toBeUndefined();
  });

  it('restores the stored baseline when strict snapshot recovery fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-restore-fallback-'));
    const entries: SessionEntry[] = [];
    const baseline = model('anthropic', 'claude-opus-4-6');
    const selected = model('openai-codex', 'gpt-5.6-luna');
    const runtime = createRuntime(entries, ['read'], 'high', ['Agent']);
    const ctx = createContext(root, entries, [undefined], [baseline, selected], selected);
    const snapshot = {
      id: 'strict',
      label: 'Strict',
      description: 'Strict',
      systemPrompt: 'Strict',
      promptStrategy: 'replace',
      modelPreferences: ['openai-codex/gpt-5.6-luna'],
      thinkingLevel: 'low',
      requiredTools: ['Agent'],
      forbiddenTools: [],
      requireModel: true,
      requireThinking: true,
      tools: ['read', 'Agent'],
      source: 'test',
      sourcePath: 'strict.md',
    };
    entries.push({
      type: 'custom',
      customType: 'diffpi-mode-state',
      data: {
        active: snapshot,
        baseline: { model: baseline, thinkingLevel: 'high', tools: ['read'] },
      },
    });
    const controller = createModeController(runtime.api, { bundledAgentsDir: join(root, 'none'), homeDir: root });

    await expect(controller.restore(ctx)).rejects.toThrow('missing required tools [Agent]');
    expect(controller.getActive()).toBeUndefined();
    expect(runtime.getActiveTools()).toEqual(['read']);
    expect(runtime.getThinkingLevel()).toBe('high');
    expect(runtime.selectedModels.at(-1)).toBe('anthropic/claude-opus-4-6');
  });

  it('normalizes legacy snapshots and rejects unavailable required tools before activation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-legacy-'));
    const homeDir = join(root, 'home');
    const agentDir = join(homeDir, '.pi', 'agent', 'agents');
    await mkdir(agentDir, { recursive: true });
    await writeFile(join(agentDir, 'legacy.md'), '---\nname: legacy\n---\nLegacy prompt');
    const entries: SessionEntry[] = [];
    const baseline = model('anthropic', 'claude-opus-4-6');
    const runtime = createRuntime(entries, ['read'], 'high');
    const ctx = createContext(root, entries, [undefined], [baseline], baseline);
    const controller = createModeController(runtime.api, {
      agentDir: join(homeDir, '.pi', 'agent'),
      bundledAgentsDir: join(root, 'none'),
      homeDir,
    });
    const legacy = await controller.set('legacy', ctx);
    expect(legacy.ok).toBe(true);
    const snapshot = entries.at(-1)?.data as { active: Record<string, unknown>; baseline: unknown };
    delete snapshot.active.requiredTools;
    delete snapshot.active.forbiddenTools;
    delete snapshot.active.requireModel;
    delete snapshot.active.requireThinking;
    const restored = createModeController(runtime.api, {
      agentDir,
      bundledAgentsDir: join(root, 'none'),
      homeDir: root,
    });
    await restored.restore(ctx);
    expect(restored.getActive()?.id).toBe('legacy');
    expect(restored.getStatus(ctx).capabilityError).toBeUndefined();
  });
});
