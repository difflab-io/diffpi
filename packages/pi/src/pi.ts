import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { readTextIfExists } from './fsx';
import { findExecutable, runChecked } from './process';

// Types -----------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

/** Result of an idempotent Pi file or configuration update. */
export interface PiConfigResult {
  /** File that was inspected or changed. */
  path: string;
  /** Whether the desired content differs from the current content. */
  changed: boolean;
  /** Whether the target existed before the operation. */
  existed: boolean;
  /** Whether dry-run mode reported a change without writing it. */
  planned: boolean;
}

/** Public Pi environment operations used by setup. */
export interface PiOperations {
  /** Find the Pi executable on the current PATH. */
  executableCheck(): Promise<string | undefined>;
  /** Return the text produced by `pi list`. */
  packageList(executable: string): Promise<string>;
  /** Match one package source against `pi list` output. */
  packageCheck(listOutput: string, source: string): boolean;
  /** Install one Pi package source. */
  packageInstall(executable: string, source: string): Promise<void>;
  /** Resolve Pi's user-level agent directory. */
  agentDir(homeDir?: string): string;
  /** Create or update one package-managed agent file. */
  agentEnsure(filename: string, content: string, agentDir?: string, dryRun?: boolean): Promise<PiConfigResult>;
  /** Report whether a skill exists in either supported global skill root. */
  skillCheckGlobal(name: string, agentDir?: string, sharedSkillsDir?: string): Promise<boolean>;
  /** Install selected upstream skills into Pi's global skill roots. */
  skillInstallGlobal(miseExecutable: string, source: string, names: readonly string[]): Promise<void>;
  /** Apply an idempotent update to one Pi JSON configuration file. */
  configEnsure(
    path: string,
    update: (config: Record<string, unknown>) => Record<string, unknown>,
    dryRun?: boolean,
  ): Promise<PiConfigResult>;
}

// Public API ------------------------------------------------------------------

/** Focused operations for Pi packages, agents, skills, and JSON configuration. */
export const pi: PiOperations = {
  executableCheck: findPiExecutable,
  packageList: listPiPackages,
  packageCheck: hasPiPackage,
  packageInstall: installPiPackage,
  agentDir: resolvePiAgentDir,
  agentEnsure: ensurePiAgent,
  skillCheckGlobal: checkGlobalPiSkill,
  skillInstallGlobal: installGlobalPiSkills,
  configEnsure: ensurePiConfig,
};

// Core ------------------------------------------------------------------------

/** Create or update one package-managed agent file. */
async function ensurePiAgent(
  filename: string,
  content: string,
  agentDir = resolvePiAgentDir(),
  dryRun = false,
): Promise<PiConfigResult> {
  const path = join(agentDir, 'agents', filename);
  const currentText = await readTextIfExists(path);
  const changed = currentText !== content;

  if (changed && !dryRun) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }

  return { path, changed, existed: currentText !== undefined, planned: changed && dryRun };
}

/** Report whether a skill exists in either supported global skill root. */
async function checkGlobalPiSkill(
  name: string,
  agentDir = resolvePiAgentDir(),
  sharedSkillsDir = join(homedir(), '.agents', 'skills'),
): Promise<boolean> {
  const roots = [join(agentDir, 'skills'), sharedSkillsDir];
  for (const root of roots) {
    if ((await readTextIfExists(join(root, name, 'SKILL.md'))) !== undefined) return true;
  }

  return false;
}

/** Install selected upstream skills into Pi's global skill roots. */
async function installGlobalPiSkills(miseExecutable: string, source: string, names: readonly string[]): Promise<void> {
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
}

/** Apply an idempotent update to one Pi JSON configuration file. */
async function ensurePiConfig(
  path: string,
  update: (config: JsonObject) => JsonObject,
  dryRun = false,
): Promise<PiConfigResult> {
  const currentText = await readTextIfExists(path);
  const current = parseJsonObject(currentText, path);
  const next = update(current);
  const changed = JSON.stringify(current) !== JSON.stringify(next);

  if (changed && !dryRun) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }

  return { path, changed, existed: currentText !== undefined, planned: changed && dryRun };
}

// Utils -----------------------------------------------------------------------

/** Find the Pi executable on the current PATH. */
async function findPiExecutable(): Promise<string | undefined> {
  return findExecutable('pi');
}

/** Return the text produced by `pi list`. */
async function listPiPackages(executable: string): Promise<string> {
  return (await runChecked(executable, ['list'])).stdout;
}

/** Match one installed package source against `pi list` output. */
function hasPiPackage(listOutput: string, source: string): boolean {
  if (listOutput.includes(source)) return true;
  return source.startsWith('https://') && listOutput.includes(source.slice('https://'.length));
}

/** Install one Pi package source. */
async function installPiPackage(executable: string, source: string): Promise<void> {
  await runChecked(executable, ['install', source]);
}

/** Resolve Pi's user-level agent directory. */
function resolvePiAgentDir(homeDir = homedir()): string {
  return (
    process.env.PI_CODING_AGENT_DIR ??
    (process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, 'pi') : join(homeDir, '.pi', 'agent'))
  );
}

function parseJsonObject(content: string | undefined, path: string): JsonObject {
  if (!content?.trim()) return {};

  try {
    const value: unknown = JSON.parse(content);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonObject;
  } catch {
    // Report one consistent error for malformed JSON and non-object values.
  }

  throw new Error(`Expected valid JSON object in ${path}.`);
}
