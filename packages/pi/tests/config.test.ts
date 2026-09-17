/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { diffpiConfigPaths, findPreferredModel, loadDiffpiConfig, resolveAgentModelPreferences } from '../src/config';

describe('Diffpi user configuration', () => {
  it('uses the product-level YAML and JSON paths', () => {
    const paths = diffpiConfigPaths('/tmp/home');

    expect(paths.yaml).toBe('/tmp/home/.difflab/diffpi/config.yaml');
    expect(paths.json).toBe('/tmp/home/.difflab/diffpi/config.json');
  });

  it('returns an empty configuration when no file exists', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-config-empty-'));

    expect(await loadDiffpiConfig({ homeDir })).toEqual({ config: {} });
  });

  it('loads JSON when YAML is absent', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-config-json-'));
    const { json } = diffpiConfigPaths(homeDir);
    await mkdir(dirname(json), { recursive: true });
    await writeFile(json, JSON.stringify({ agents: { copilot: { models: ['haiku'] } } }));

    const loaded = await loadDiffpiConfig({ homeDir });

    expect(loaded.path).toBe(json);
    expect(loaded.config.agents?.copilot?.models).toEqual(['haiku']);
  });

  it('prefers YAML when both formats exist', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-config-yaml-'));
    const { yaml, json } = diffpiConfigPaths(homeDir);
    await mkdir(dirname(yaml), { recursive: true });
    await writeFile(yaml, '---\nagents:\n  orchestrator:\n    models:\n      - sol\n      - opus-4-8\n');
    await writeFile(json, JSON.stringify({ agents: { orchestrator: { models: ['deepseek-v4-pro'] } } }));

    const loaded = await loadDiffpiConfig({ homeDir });

    expect(loaded.path).toBe(yaml);
    expect(loaded.config.agents?.orchestrator?.models).toEqual(['sol', 'opus-4-8']);
  });

  it('reports the invalid config path', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-config-invalid-'));
    const { yaml } = diffpiConfigPaths(homeDir);
    await mkdir(dirname(yaml), { recursive: true });
    await writeFile(yaml, 'agents: [invalid');

    expect(loadDiffpiConfig({ homeDir })).rejects.toThrow(`Invalid Diffpi config at ${yaml}`);
  });

  it('replaces defaults and supports an explicit empty preference list', () => {
    const defaults = ['sol', 'opus'];

    expect(
      resolveAgentModelPreferences('orchestrator', defaults, {
        agents: { orchestrator: { models: ['deepseek-v4-pro'] } },
      }),
    ).toEqual(['deepseek-v4-pro']);
    expect(
      resolveAgentModelPreferences('orchestrator', defaults, {
        agents: { orchestrator: { models: [] } },
      }),
    ).toEqual([]);
    expect(resolveAgentModelPreferences('worker', defaults, {})).toEqual(defaults);
  });

  it('matches an exact provider first and then the same model under another provider', () => {
    const models = [
      { provider: 'openrouter', id: 'anthropic/claude-opus-4.8' },
      { provider: 'meridian', id: 'claude-opus-4-8' },
    ];

    expect(findPreferredModel(models, 'meridian/claude-opus-4-8')).toEqual(models[1]);
    expect(findPreferredModel(models, 'missing/claude-opus-4-8')).toEqual(models[1]);
  });
});
