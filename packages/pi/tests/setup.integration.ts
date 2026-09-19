/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChecked } from '../src/extensions/processx';
import { ensurePiAgents, gitlabMcpHost, setupPi, setupRequiresRestart, type SetupResult } from '../src/setup';

describe('setupPi', () => {
  describe('given the user has not used Diffpi before', () => {
    it('plans setup without mutating the machine', async () => {
      const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-setup-'));
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
      expect(names).toContain('pi agent reviewer');
      expect(names).not.toContain('pi agent planner');
      expect(names).toContain('pi skill docs-search');
      expect(names).toContain('pi skill simple-english');
      expect(names).toContain('pi skill git');
      expect(names).not.toContain('Zed review task');
    }, 20_000);
  });

  describe('given the user has outdated settings', () => {
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
  });

  describe('given the user has current settings', () => {
    it('keeps namespaced agents ready without reinstalling them', async () => {
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
  });

  it('plans selected hosted VCS CLIs and opt-in Zed integration', async () => {
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
        forges: ['github', 'gitlab'],
        bindZedKey: true,
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
    const names = result.actions.map((item) => item.name);
    expect(names).toContain('gh');
    expect(names).toContain('glab');
    expect(names).toContain('Zed review tasks');
    expect(names).toContain('Zed review keybinding');
  }, 20_000);
});

describe('gitlabMcpHost', () => {
  it('uses a GitLab host only when the repository remote is GitLab', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-gitlab-host-'));
    await runChecked('git', ['init', root]);
    await runChecked('git', ['-C', root, 'remote', 'add', 'origin', 'https://github.com/example/project.git']);
    expect(await gitlabMcpHost(root)).toBe('gitlab.com');
    await runChecked('git', [
      '-C',
      root,
      'remote',
      'set-url',
      'origin',
      'https://gitlab.example.com/group/project.git',
    ]);
    expect(await gitlabMcpHost(root)).toBe('gitlab.example.com');
  });
});

describe('setupRequiresRestart', () => {
  it('requires a reload only when a bundled agent changes', () => {
    expect(setupRequiresRestart([{ name: 'pi agent worker', status: 'updated', detail: 'updated worker' }])).toBe(true);
    expect(setupRequiresRestart([{ name: 'pi agent worker', status: 'ready', detail: 'worker is current' }])).toBe(
      false,
    );
  });
});
