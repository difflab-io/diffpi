import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { findExecutable, runChecked } from './process';

type JsonObject = Record<string, unknown>;

export interface PiConfigResult {
  path: string;
  changed: boolean;
  existed: boolean;
  planned: boolean;
}

export const pi = {
  async executableCheck(): Promise<string | undefined> {
    return findExecutable('pi');
  },

  async packageList(executable: string): Promise<string> {
    return (await runChecked(executable, ['list'])).stdout;
  },

  packageCheck(listOutput: string, source: string): boolean {
    if (listOutput.includes(source)) return true;
    return source.startsWith('https://') && listOutput.includes(source.slice('https://'.length));
  },

  async packageInstall(executable: string, source: string): Promise<void> {
    await runChecked(executable, ['install', source]);
  },

  agentDir(homeDir = homedir()): string {
    return resolveAgentDir(homeDir);
  },

  async skillCheckGlobal(
    name: string,
    agentDir = resolveAgentDir(),
    sharedSkillsDir = join(homedir(), '.agents', 'skills'),
  ): Promise<boolean> {
    // `skills add --agent pi --global` writes to the agent directory, but pi also
    // loads globally installed skills from the shared `~/.agents/skills` root.
    const roots = [join(agentDir, 'skills'), sharedSkillsDir];
    for (const root of roots) {
      if ((await readOptional(join(root, name, 'SKILL.md'))) !== undefined) return true;
    }

    return false;
  },

  async skillInstallGlobal(miseExecutable: string, source: string, names: readonly string[]): Promise<void> {
    const selection = names.flatMap((name) => ['--skill', name]);
    await runChecked(miseExecutable, [
      'x',
      'node@22',
      '--',
      'npx',
      '-y',
      'skills',
      'add',
      source,
      ...selection,
      '--global',
      '--agent',
      'pi',
      '--yes',
    ]);
  },

  async configEnsure(
    path: string,
    update: (config: JsonObject) => JsonObject,
    dryRun = false,
  ): Promise<PiConfigResult> {
    const currentText = await readOptional(path);
    const current = parseObject(currentText, path);
    const next = update(current);
    const changed = JSON.stringify(current) !== JSON.stringify(next);

    if (changed && !dryRun) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }

    return { path, changed, existed: currentText !== undefined, planned: changed && dryRun };
  },
};

function resolveAgentDir(homeDir = homedir()): string {
  return (
    process.env.PI_CODING_AGENT_DIR ??
    (process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'pi') : join(homeDir, '.pi', 'agent'))
  );
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseObject(content: string | undefined, path: string): JsonObject {
  if (!content?.trim()) return {};

  try {
    const value: unknown = JSON.parse(content);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  } catch {
    // Report one consistent error for malformed JSON and non-object values.
  }

  throw new Error(`Expected valid JSON object in ${path}.`);
}
