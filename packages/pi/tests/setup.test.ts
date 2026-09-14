/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcp } from '../src/mcp';
import { mise } from '../src/mise';
import { setupPi } from '../src/setup';
import { diffpiSetupTool, diffpiValidateTool, piTools } from '../src/tools/index';

describe('setup modules', () => {
  it('exposes global and local mise operations', () => {
    expect(Object.keys(mise)).toEqual([
      'executableCheck',
      'install',
      'hookEnsure',
      'toolCheckGlobal',
      'toolInstallGlobal',
      'toolCheckLocal',
      'toolInstallLocal',
      'toolUpdateAllGlobal',
    ]);
  });

  it('writes the mise hook once', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-mise-'));
    const first = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell: '/bin/zsh' });
    const second = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell: '/bin/zsh' });
    const content = await readFile(join(homeDir, '.zshrc'), 'utf8');

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(content.match(/@difflab\/pi mise/g)?.length).toBe(2);
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

  it('reports planned setup without mutations', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-setup-'));
    const result = await setupPi({
      homeDir,
      agentDir: join(homeDir, '.pi', 'agent'),
      projectDir: '/tmp/project',
      shell: '/bin/zsh',
      dryRun: true,
      issueTracker: 'jira',
    });

    const names = result.actions.map((item) => item.name);
    expect(result.actions.some((item) => item.status === 'planned')).toBe(true);
    expect(result.actions.every((item) => item.status !== 'installed' && item.status !== 'updated')).toBe(true);
    expect(names).toContain('context-mode');
    expect(names).toContain('pi package npm:@juicesharp/rpiv-ask-user-question');
    expect(names).toContain('pi package npm:context-mode');
    expect(names).toContain('pi skill docs-search');
    expect(names).toContain('pi skill simple-english');
  }, 20_000);
});

describe('@difflab/pi tools', () => {
  it('exports namespaced setup and validation tools', () => {
    expect(diffpiSetupTool.name).toBe('diffpi_setup');
    expect(diffpiValidateTool.name).toBe('diffpi_validate');
    expect(piTools.map((tool) => tool.name)).toEqual(['diffpi_setup', 'diffpi_validate']);
  });
});
