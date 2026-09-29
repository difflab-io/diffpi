import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { resolveBundledAgentsDir } from './assets';
import { pi } from './pi';
import { ensurePiAgents, type SetupAction, type SetupOptions } from './setup';

const REQUIRED_AGENTS = [
  'diffpi-orchestrator.md',
  'diffpi-plan-reviewer.md',
  'diffpi-planner.md',
  'diffpi-reviewer.md',
  'diffpi-worker.md',
] as const;

export interface AgentDoctorResult {
  actions: SetupAction[];
  backups: string[];
  agentDir: string;
}

/** Inspect or sync only installed Diffpi agent files, never full setup. */
export async function doctorAgents(options: SetupOptions = {}): Promise<AgentDoctorResult> {
  const bundledDir = options.bundledAgentsDir ?? resolveBundledAgentsDir();
  const agentDir = options.agentDir ?? pi.agentDir(options.homeDir);
  const targetDir = join(agentDir, 'agents');
  const bundled = (await readdir(bundledDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith('diffpi-') && entry.name.endsWith('.md'))
    .map((entry) => entry.name);

  for (const name of REQUIRED_AGENTS)
    if (!bundled.includes(name)) throw new Error(`Installed @difflab/pi is missing bundled agent ${name}`);
  for (const name of bundled) {
    const content = await readFile(join(bundledDir, name), 'utf8');
    if (content.includes('diffpi_modes_')) throw new Error(`Installed agent ${name} still requires removed mode tools`);
  }

  const preview = await ensurePiAgents({ ...options, agentDir, bundledAgentsDir: bundledDir, dryRun: true });
  if (options.dryRun) return { actions: preview, backups: [], agentDir };

  // Preflight all destinations before changing any of them. Never follow a
  // user-created symlink or overwrite an unrelated global agent.
  const changed = preview.filter((action) => action.status === 'planned');
  const originals: Array<{ path: string; content: Buffer }> = [];
  for (const action of changed) {
    const path = action.detail;
    if (!bundled.includes(basename(path))) throw new Error(`Unexpected agent destination: ${path}`);
    try {
      const stat = await lstat(path);
      if (!stat.isFile()) throw new Error(`Refusing to overwrite non-file agent: ${path}`);
      originals.push({ path, content: await readFile(path) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  const backups: string[] = [];
  if (originals.length > 0) {
    const backupDir = join(targetDir, '.diffpi-doctor-backups');
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    for (const original of originals) {
      const digest = createHash('sha256').update(original.content).digest('hex').slice(0, 16);
      const backupPath = join(backupDir, `${basename(original.path)}.${digest}.bak`);
      try {
        await writeFile(backupPath, original.content, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing = await readFile(backupPath);
        if (!existing.equals(original.content)) throw new Error(`Backup hash collision: ${backupPath}`);
      }
      backups.push(backupPath);
    }
  }

  const actions = await ensurePiAgents({ ...options, agentDir, bundledAgentsDir: bundledDir, dryRun: false });
  return { actions, backups, agentDir };
}
