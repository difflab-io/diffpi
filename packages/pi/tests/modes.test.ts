/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import difflabPiExtension from '../extensions/index';
import { createModeController, discoverAgentModes, resolveAgentMode } from '../src/modes';

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
    const reviewer = standard.modes.find((mode) => mode.id === 'reviewer');

    expect(standard.modes.map((mode) => mode.id)).toEqual(
      expect.arrayContaining(['tutor', 'copilot', 'planner', 'worker', 'orchestrator', 'autonomous']),
    );
    expect(standard.modes.map((mode) => mode.id)).not.toContain('spec:planner');
    expect(withSkills.modes.map((mode) => mode.id)).toContain('spec:planner');
    expect(withSkills.modes.map((mode) => mode.id)).toContain('explore:researcher');
    expect(reviewer?.systemPrompt).toBe('Project reviewer prompt.');
    expect(reviewer?.promptStrategy).toBe('replace');
    expect(untrusted.modes.map((mode) => mode.id)).not.toContain('explore:researcher');
    expect(untrusted.modes.find((mode) => mode.id === 'reviewer')?.systemPrompt).toBe('User reviewer prompt.');

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

  it('implements direct, skill-inclusive, and interactive /modes command paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-modes-command-'));
    const skillAgent = join(root, '.agents', 'skills', 'spec', 'agents', 'planner.md');
    await mkdir(dirname(skillAgent), { recursive: true });
    await writeFile(skillAgent, '# Planner\n\nPlan this project.\n');

    const commands = new Map<string, { handler: (args: string, ctx: ExtensionContext) => Promise<void> | void }>();
    const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
    const statuses: Array<string | undefined> = [];
    const notifications: string[] = [];
    const messages: Array<{ content: unknown; options: unknown }> = [];
    const extensionApi = {
      registerTool() {},
      registerCommand(
        name: string,
        command: { handler: (args: string, ctx: ExtensionContext) => Promise<void> | void },
      ) {
        commands.set(name, command);
      },
      appendEntry(customType: string, data?: unknown) {
        entries.push({ type: 'custom', customType, data });
      },
      sendMessage(message: { content: unknown }, options: unknown) {
        messages.push({ content: message.content, options });
      },
      on() {},
    } as unknown as ExtensionAPI;
    difflabPiExtension(extensionApi);

    const ctx = {
      ...createContext(root, entries, statuses),
      ui: {
        setStatus(_key: string, value: string | undefined) {
          statuses.push(value);
        },
        notify(message: string) {
          notifications.push(message);
        },
      },
    } as ExtensionContext;
    const command = commands.get('modes');

    await command?.handler('tutor', ctx);
    await command?.handler('spec:planner', ctx);
    await command?.handler('clear', ctx);
    await command?.handler('', ctx);
    await command?.handler('--include-skills', ctx);

    expect(notifications[0]).toContain('Active inline agent: tutor');
    expect(notifications[1]).toContain('Active inline agent: spec:planner');
    expect(notifications[2]).toContain('Inline agent cleared');
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain('ask_user_question');
    expect(messages[0]?.content).not.toContain('skill agents are included');
    expect(messages[1]?.content).toContain('skill agents are included');
    expect(messages[0]?.options).toEqual({ triggerTurn: true });
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
