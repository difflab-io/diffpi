import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { spawn } from 'node:child_process';

// Constants -------------------------------------------------------------------

const MAX_CAPTURED_OUTPUT_LENGTH = 65_536;

// Types -----------------------------------------------------------------------

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
}

// Public API ------------------------------------------------------------------

export async function findExecutable(name: string): Promise<string | undefined> {
  if (name.includes('/')) {
    try {
      await access(name, constants.X_OK);
      return name;
    } catch {
      return undefined;
    }
  }

  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue searching PATH.
    }
  }

  return undefined;
}

export function run(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk.toString());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString());
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (options.input !== undefined && child.stdin) child.stdin.end(options.input);
  });
}

export async function runChecked(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const result = await run(command, args, options);
  if (result.code === 0) return result;

  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
  throw new Error(`${command} ${args.join(' ')} failed: ${detail}`);
}

// Utilities -------------------------------------------------------------------

function appendBounded(current: string, next: string): string {
  const combined = current + next;
  return combined.length <= MAX_CAPTURED_OUTPUT_LENGTH ? combined : combined.slice(-MAX_CAPTURED_OUTPUT_LENGTH);
}
