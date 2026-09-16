/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import difflabPiExtension from '../extensions/index';
import {
  createModeController,
  discoverAgentModes,
  resolveAgentMode,
  type ModeCatalog,
  type ModeDiscoveryOptions,
} from '../src/modes';

function createContext(
  cwd: string,
  entries: Array<{ type: string; customType?: string; data?: unknown }>,
  statuses: Array<string | undefined>,
  trusted = true,
): ExtensionContext {
  return {
    cwd,
    isProjectTrusted: () => trusted,
    sessionManager: { getBranch: () => entries },
    ui: {
      setStatus(_key: string, value: string | undefined) {
        statuses.push(value);
      },
    },
  } as unknown as ExtensionContext;
}

describe('inline agent modes', () => {
  it('shares standard agents and includes skill agents only when requested', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-modes-'));
    const homeDir = join(root, 'home');
    const agentDir = join(homeDir, '.pi', 'agent');
    const cwd = join(root, 'project');
    const userAgent = join(agentDir, 'agents', 'reviewer.md');
    const projectAgent = join(cwd, '.pi', 'agents', 'reviewer.md');
    const specAgent = join(homeDir, '.agents', 'skills', 'spec', 'agents', 'planner.md');
    const exploreAgent = join(cwd, '.agents', 'skills', 'explore', 'agents', 'researcher.md');

    for (const path of [userAgent, projectAgent, specAgent, exploreAgent]) {
      await mkdir(dirname(path), { recursive: true });
    }
    await writeFile(userAgent, '---\nprompt_mode: append\n---\nUser reviewer prompt.\n');
    await writeFile(projectAgent, '---\ndescription: Project reviewer\n---\nProject reviewer prompt.\n');
    await writeFile(specAgent, '# Planner\n\nSpec planning prompt.\n');
    await writeFile(exploreAgent, '---\nname: researcher\n---\nProject research prompt.\n');

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
    const reviewer = standard.modes.find((mode) => mode.id === 'reviewer');

    expect(standard.modes.map((mode) => mode.id)).toEqual(
      expect.arrayContaining(['tutor', 'copilot', 'planner', 'worker', 'orchestrator']),
    );
    expect(standard.modes.map((mode) => mode.id)).not.toContain('autonomous');
    expect(standard.modes.map((mode) => mode.id)).not.toContain('spec:planner');
    expect(withSkills.modes.map((mode) => mode.id)).toContain('spec:planner');
    expect(withSkills.modes.map((mode) => mode.id)).toContain('explore:researcher');
    expect(reviewer?.systemPrompt).toBe('Project reviewer prompt.');
    expect(reviewer?.promptStrategy).toBe('replace');
    expect(untrusted.modes.map((mode) => mode.id)).not.toContain('explore:researcher');
    expect(untrusted.modes.find((mode) => mode.id === 'reviewer')?.systemPrompt).toBe('User reviewer prompt.');
    expect(unspecifiedTrust.modes.find((mode) => mode.id === 'reviewer')?.systemPrompt).toBe('User reviewer prompt.');

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

  it('routes mode requests through the packaged skill', async () => {
    const skill = await readFile(new URL('../skills/mode/SKILL.md', import.meta.url), 'utf8');

    expect(skill).toContain('name: mode');
    expect(skill).toContain('allowed-tools: ask_user_question diffpi_modes_list diffpi_modes_set diffpi_modes_unset');
    expect(skill).toContain('If the argument is `help`, `-h`, or `--help`');
    expect(skill).toContain('If the argument is `clear`, call `diffpi_modes_unset`');
    expect(skill).toContain('If the argument is one agent id, call `diffpi_modes_set`');
    expect(skill).toContain('Set `includeSkills` to true only for `--include-skills`');
    expect(skill).toContain('Call `ask_user_question` with one single-select question');
  });

  it('declares read-only and worker delegation policies for subagents', async () => {
    const [tutor, planner, orchestrator] = await Promise.all([
      readFile(new URL('../agents/diffpi-tutor.md', import.meta.url), 'utf8'),
      readFile(new URL('../agents/diffpi-planner.md', import.meta.url), 'utf8'),
      readFile(new URL('../agents/diffpi-orchestrator.md', import.meta.url), 'utf8'),
    ]);

    expect(tutor).toContain('tools: read, grep, find');
    expect(planner).toContain('tools: read, grep, find');
    expect(orchestrator).toContain('allowed_subagents: worker');
    expect(orchestrator).toContain('`Agent` with `subagent_type: worker`');
    expect(orchestrator).not.toMatch(/^model:/m);
  });

  it('runs the extension tool and prompt lifecycle end to end', async () => {
    type EventHandler = (...args: unknown[]) => unknown;

    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-e2e-'));
    const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
    const statuses: Array<string | undefined> = [];
    const tools = new Map<string, ToolDefinition>();
    const handlers = new Map<string, EventHandler[]>();
    const extensionApi = {
      registerTool(tool: ToolDefinition) {
        tools.set(tool.name, tool);
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
    } as unknown as ExtensionAPI;
    const ctx = createContext(root, entries, statuses);

    difflabPiExtension(extensionApi);

    const listResult = await tools.get('diffpi_modes_list')?.execute('list', {}, undefined, undefined, ctx);
    const listDetails = listResult?.details as { catalog?: ModeCatalog } | undefined;
    expect(listDetails?.catalog?.modes.map((mode) => mode.id)).toContain('worker');

    await tools.get('diffpi_modes_set')?.execute('set', { agent: 'worker' }, undefined, undefined, ctx);
    const beforeStart = handlers.get('before_agent_start')?.at(-1);
    const activePrompt = (await beforeStart?.({ systemPrompt: 'BASE' }, ctx)) as { systemPrompt?: string } | undefined;
    expect(activePrompt?.systemPrompt).toContain('BASE');
    expect(activePrompt?.systemPrompt).toContain('focused implementation worker');
    expect(entries.at(-1)?.customType).toBe('diffpi-mode-state');
    expect(statuses.at(-1)).toBe('mode: worker');

    await tools.get('diffpi_modes_unset')?.execute('unset', {}, undefined, undefined, ctx);
    const defaultPrompt = (await beforeStart?.({ systemPrompt: 'BASE' }, ctx)) as { systemPrompt?: string } | undefined;
    expect(defaultPrompt?.systemPrompt).toContain('## Skill and tool routing');
    expect(defaultPrompt?.systemPrompt).not.toContain('Active inline agent');
    expect(statuses.at(-1)).toBeUndefined();
  });

  it('applies and restores session-scoped prompt snapshots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-mode-state-'));
    const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
    const statuses: Array<string | undefined> = [];
    const ctx = createContext(root, entries, statuses);
    const pi = {
      appendEntry(customType: string, data?: unknown) {
        entries.push({ type: 'custom', customType, data });
      },
    };
    const controller = createModeController(pi, { agentDir: join(root, 'agent'), homeDir: join(root, 'home') });

    const tutor = await controller.set('tutor', ctx);
    expect(tutor.ok).toBe(true);
    expect(controller.apply('BASE PROMPT')).not.toContain('BASE PROMPT');
    expect(statuses.at(-1)).toBe('mode: tutor');

    const restored = createModeController(pi, { agentDir: join(root, 'agent'), homeDir: join(root, 'home') });
    restored.restore(ctx);
    expect(restored.getActive()?.id).toBe('tutor');

    const copilot = await restored.set('copilot', ctx);
    expect(copilot.ok).toBe(true);
    expect(restored.apply('BASE PROMPT')).toContain('BASE PROMPT');
    expect(restored.apply('BASE PROMPT')).toContain('Active inline agent: Copilot');

    const cleared = restored.unset(ctx);
    expect(cleared.ok).toBe(true);
    expect(restored.apply('BASE PROMPT')).toBe('BASE PROMPT');
    expect(statuses.at(-1)).toBeUndefined();
  });
});
