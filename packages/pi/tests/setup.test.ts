/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBundledAgentsDir } from '../src/assets';
import { mcp } from '../src/mcp';
import { mise } from '../src/mise';
import { createModeController } from '../src/modes';
import { ensurePiAgents, setupPi, setupRequiresRestart, type SetupResult } from '../src/setup';
import difflabPiExtension from '../extensions/index';
import { createPiTools, diffpiSetupTool, diffpiValidateTool } from '../src/tools/index';

// Setup modules ---------------------------------------------------------------

describe('setup modules', () => {
  it('exposes global and local mise operations', () => {
    const operations = [
      'executableCheck',
      'install',
      'hookEnsure',
      'toolCheckGlobal',
      'toolInstallGlobal',
      'toolCheckLocal',
      'toolInstallLocal',
      'toolUpdateAllGlobal',
    ] as const;

    for (const name of operations) expect(typeof mise[name]).toBe('function');
  });

  it('writes supported shell hooks once', async () => {
    const cases = [
      ['/bin/bash', '.bashrc'],
      ['/bin/zsh', '.zshrc'],
      ['/usr/bin/fish', '.config/fish/config.fish'],
      ['/usr/bin/nu', '.config/nushell/config.nu'],
      ['/usr/bin/xonsh', '.xonshrc'],
      ['/usr/bin/elvish', '.config/elvish/rc.elv'],
      ['/usr/bin/pwsh', '.config/powershell/Microsoft.PowerShell_profile.ps1'],
    ] as const;

    for (const [shell, relativePath] of cases) {
      const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-mise-'));
      const first = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell });
      const second = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell });
      const content = await readFile(join(homeDir, relativePath), 'utf8');

      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
      expect(content.match(/@difflab\/pi mise/g)?.length).toBe(2);
    }
  });

  it('falls back to Bash for unknown shells', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-mise-'));
    const result = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell: '/bin/custom-shell' });

    expect(result.path).toBe(join(homeDir, '.bashrc'));
    expect(await readFile(result.path, 'utf8')).toContain('activate bash');
  });

  it('checks the complete minimum tool version', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-version-'));
    const executable = join(homeDir, 'mise');
    await writeFile(executable, '#!/bin/sh\nprintf \'%s\\n\' \'[{"installed":true,"version":"22.19.0"}]\'\n');
    await chmod(executable, 0o755);

    expect(await mise.toolCheckGlobal(executable, 'node', '22.19.0')).toBe(true);
    expect(await mise.toolCheckGlobal(executable, 'node', '22.20.0')).toBe(false);
  });

  it('merges MCP servers with the adapter schema', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-mcp-'));
    const path = mcp.globalConfigPath(homeDir);
    const first = await mcp.serversEnsure({ mise: { command: 'mise', args: ['mcp'] } }, { path });
    const second = await mcp.serversEnsure({ mise: { command: 'mise', args: ['mcp'] } }, { path });
    const config = JSON.parse(await readFile(path, 'utf8'));

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(config.mcpServers.mise).toEqual({ command: 'mise', args: ['mcp'] });
  });

  it('locates bundled agents from nested build entry points', () => {
    const nestedEntry = new URL('../dist/extensions/index.js', import.meta.url).href;
    const expected = fileURLToPath(new URL('../agents', import.meta.url));

    expect(resolveBundledAgentsDir(nestedEntry)).toBe(expected);
  });

  it('installs only namespaced bundled agents into the shared global agent directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-agents-'));
    const agentDir = join(root, 'agent');
    const bundledAgentsDir = join(root, 'bundled');
    await mkdir(bundledAgentsDir);
    await writeFile(join(bundledAgentsDir, 'diffpi-worker.md'), '---\nname: worker\n---\nWork.\n');
    await writeFile(join(bundledAgentsDir, 'README.md'), '# Package notes\n');

    const first = await ensurePiAgents({ homeDir: root, agentDir, bundledAgentsDir });
    const second = await ensurePiAgents({ homeDir: root, agentDir, bundledAgentsDir });

    expect(first).toHaveLength(1);
    expect(first[0]?.status).toBe('installed');
    expect(second[0]?.status).toBe('ready');
    expect(await readFile(join(agentDir, 'agents', 'diffpi-worker.md'), 'utf8')).toContain('name: worker');
    expect(readFile(join(agentDir, 'agents', 'README.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('materializes the first available configured model for delegated agents', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-agent-models-'));
    const agentDir = join(homeDir, '.pi', 'agent');
    const bundledAgentsDir = join(homeDir, 'bundled');
    const configPath = join(homeDir, '.difflab', 'diffpi', 'config.yaml');
    await mkdir(bundledAgentsDir, { recursive: true });
    await mkdir(join(homeDir, '.difflab', 'diffpi'), { recursive: true });
    await writeFile(
      join(bundledAgentsDir, 'diffpi-orchestrator.md'),
      '---\nname: orchestrator\nmodel: sol\nmodel_fallbacks: opus-4-8, deepseek-v4-pro\n---\nOrchestrate.\n',
    );
    await writeFile(
      configPath,
      'agents:\n  orchestrator:\n    models:\n      - sol\n      - opus-4-8\n      - deepseek-v4-pro\n',
    );

    await ensurePiAgents({
      homeDir,
      agentDir,
      bundledAgentsDir,
      availableModels: [
        { provider: 'meridian', id: 'claude-opus-4-8' },
        { provider: 'deepseek', id: 'deepseek-v4-pro' },
      ],
    });

    const installedPath = join(agentDir, 'agents', 'diffpi-orchestrator.md');
    const installed = await readFile(installedPath, 'utf8');
    expect(installed).toContain('model: meridian/claude-opus-4-8');
    expect(installed).toContain('model_fallbacks: sol, deepseek-v4-pro');

    await ensurePiAgents({ homeDir, agentDir, bundledAgentsDir, availableModels: [] });

    const inherited = await readFile(installedPath, 'utf8');
    expect(inherited).not.toMatch(/^model:/m);
    expect(inherited).toContain('model_fallbacks: sol, opus-4-8, deepseek-v4-pro');
  });

  it('requires a reload when a bundled agent changes', () => {
    expect(setupRequiresRestart([{ name: 'pi agent worker', status: 'updated', detail: 'updated worker' }])).toBe(true);
    expect(setupRequiresRestart([{ name: 'pi agent worker', status: 'ready', detail: 'worker is current' }])).toBe(
      false,
    );
  });

  it('plans the github forge CLI without mutations', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-forge-'));
    const emptyPath = await mkdtemp(join(tmpdir(), 'diffpi-path-'));
    const previousPath = process.env.PATH;
    process.env.PATH = emptyPath;

    let result: SetupResult;
    try {
      result = await setupPi({
        homeDir,
        agentDir: join(homeDir, '.pi', 'agent'),
        projectDir: '/tmp/project',
        shell: '/bin/zsh',
        dryRun: true,
        forge: 'github',
        bindZedKey: true,
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }

    const names = result.actions.map((item) => item.name);
    expect(names).toContain('gh');
    expect(names).toContain('Zed review task');
    expect(names).toContain('Zed review keybinding');
    expect(result.actions.every((item) => item.status !== 'installed' && item.status !== 'updated')).toBe(true);
  }, 20_000);

  it('reports planned setup without mutations', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-setup-'));
    const emptyPath = await mkdtemp(join(tmpdir(), 'diffpi-path-'));
    const previousPath = process.env.PATH;
    // Hide any real mise or pi install so the run cannot read this machine's state.
    process.env.PATH = emptyPath;

    let result: SetupResult;
    try {
      result = await setupPi({
        homeDir,
        agentDir: join(homeDir, '.pi', 'agent'),
        projectDir: '/tmp/project',
        shell: '/bin/zsh',
        dryRun: true,
        issueTracker: 'jira',
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }

    const names = result.actions.map((item) => item.name);
    expect(result.actions.some((item) => item.status === 'planned')).toBe(true);
    expect(result.actions.every((item) => item.status !== 'installed' && item.status !== 'updated')).toBe(true);
    expect(names).toContain('context-mode');
    expect(names).toContain('pi package npm:context-mode');
    expect(names).toContain('pi agent tutor');
    expect(names).toContain('pi agent orchestrator');
    expect(names).toContain('pi agent planner');
    expect(names).toContain('pi agent autonomous');
    expect(names).toContain('pi agent reviewer');
    expect(names).toContain('pi skill docs-search');
    expect(names).toContain('pi skill simple-english');
    expect(names).not.toContain('Zed review task');
  }, 20_000);
});

// Tool catalog ----------------------------------------------------------------

describe('@difflab/pi tools', () => {
  it('registers the upstream question tool through the package extension', () => {
    const toolNames: string[] = [];
    const commandNames: string[] = [];
    const extensionApi = {
      registerTool(tool: ToolDefinition) {
        toolNames.push(tool.name);
      },
      registerCommand(name: string) {
        commandNames.push(name);
      },
      appendEntry() {},
      sendMessage() {},
      on() {},
    } as unknown as ExtensionAPI;

    difflabPiExtension(extensionApi);

    expect(toolNames).toContain('ask_user_question');
    expect(toolNames).toContain('diffpi_setup');
    expect(toolNames).toContain('diffpi_validate');
    expect(toolNames).toContain('diffpi_reload');
    expect(toolNames).toContain('diffpi_modes_list');
    expect(toolNames).toContain('diffpi_modes_set');
    expect(toolNames).toContain('diffpi_modes_unset');
    expect(commandNames).toEqual(['diffpi-reload', 'review']);
  });

  it('exports the complete namespaced tool catalog', async () => {
    const messages: string[] = [];
    const modes = createModeController({ appendEntry() {} }, { agentDir: '/tmp/diffpi-agent', homeDir: '/tmp' });
    const tools = createPiTools(
      {
        sendUserMessage(content) {
          if (typeof content === 'string') messages.push(content);
        },
      },
      modes,
    );
    const reloadTool = tools.find((tool) => tool.name === 'diffpi_reload');

    expect(diffpiSetupTool.name).toBe('diffpi_setup');
    expect((diffpiSetupTool.parameters as { required?: string[] }).required).toBeUndefined();
    expect(diffpiValidateTool.name).toBe('diffpi_validate');
    expect(tools.map((tool) => tool.name)).toEqual([
      'diffpi_setup',
      'diffpi_validate',
      'diffpi_reload',
      'diffpi_modes_list',
      'diffpi_modes_set',
      'diffpi_modes_unset',
      'review_context',
      'review_open',
      'review_diff',
      'review_gates',
      'review_submit',
      'review_comments',
      'review_respond',
      'review_publish',
      'review_complete',
      'review_merge',
      'review_launch',
    ]);
    expect(reloadTool).toBeDefined();

    await reloadTool?.execute('reload', {}, undefined, undefined, {} as never);
    expect(messages).toEqual(['/diffpi-reload']);
  });
});
