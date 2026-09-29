/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctorAgents } from '../src/doctor';

const coreAgents = ['orchestrator', 'plan-reviewer', 'planner', 'reviewer', 'worker'];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'diffpi-doctor-'));
  const bundledAgentsDir = join(root, 'package', 'agents');
  const agentDir = join(root, 'pi');
  const globalAgentsDir = join(agentDir, 'agents');
  await mkdir(bundledAgentsDir, { recursive: true });
  await mkdir(globalAgentsDir, { recursive: true });
  for (const name of coreAgents)
    await writeFile(join(bundledAgentsDir, `diffpi-${name}.md`), `---\nname: diffpi-${name}\n---\nCurrent ${name}.\n`);
  return { root, bundledAgentsDir, agentDir, globalAgentsDir };
}

describe('Diffpi agent doctor', () => {
  it('previews without changes, backs up stale agents and repairs idempotently', async () => {
    const { bundledAgentsDir, agentDir, globalAgentsDir } = await fixture();
    const planner = join(globalAgentsDir, 'diffpi-planner.md');
    const stale = '---\nname: planner\n---\nCall diffpi_modes_status.\n';
    await writeFile(planner, stale);
    await writeFile(join(globalAgentsDir, 'my-agent.md'), 'Keep this user agent.\n');
    const options = { bundledAgentsDir, agentDir, availableModels: [] };

    const preview = await doctorAgents({ ...options, dryRun: true });
    expect(preview.actions).toHaveLength(coreAgents.length);
    expect(preview.actions.every((action) => action.status === 'planned')).toBe(true);
    expect(preview.backups).toEqual([]);
    expect(await readFile(planner, 'utf8')).toBe(stale);

    const repaired = await doctorAgents(options);
    expect(repaired.actions.find((action) => action.name === 'pi agent planner')?.status).toBe('updated');
    expect(repaired.backups).toHaveLength(1);
    expect(await readFile(repaired.backups[0]!, 'utf8')).toBe(stale);
    expect(await readFile(planner, 'utf8')).toContain('name: diffpi-planner');
    expect(await readFile(join(globalAgentsDir, 'my-agent.md'), 'utf8')).toBe('Keep this user agent.\n');

    const again = await doctorAgents(options);
    expect(again.actions.every((action) => action.status === 'ready')).toBe(true);
    expect(again.backups).toEqual([]);
    expect(await readdir(join(globalAgentsDir, '.diffpi-doctor-backups'))).toHaveLength(1);
  });

  it('refuses an incomplete or mode-dependent installed package before modifying global agents', async () => {
    const { bundledAgentsDir, agentDir, globalAgentsDir } = await fixture();
    const planner = join(globalAgentsDir, 'diffpi-planner.md');
    await writeFile(planner, 'Local profile.\n');
    await writeFile(join(bundledAgentsDir, 'diffpi-planner.md'), 'Call diffpi_modes_status.\n');
    await expect(doctorAgents({ bundledAgentsDir, agentDir })).rejects.toThrow('removed mode tools');
    expect(await readFile(planner, 'utf8')).toBe('Local profile.\n');
  });
});
