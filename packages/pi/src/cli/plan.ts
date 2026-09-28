import { Command, CommanderError } from 'commander';
import { stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { run } from '../extensions/processx';

export interface PlanCliIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

interface PlanCliRuntime {
  execute: (
    command: string,
    args: string[],
    cwd: string,
    interactive: boolean,
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
}

const runtime: PlanCliRuntime = {
  execute: (command, args, cwd, interactive) => run(command, args, { cwd, capture: 'unbounded', interactive }),
};

export function createPlanCliCommand(io: PlanCliIO = process, planRuntime: PlanCliRuntime = runtime): Command {
  const program = new Command()
    .name('plan')
    .description('Direct-file plan commands')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (message) => io.stdout.write(message),
      writeErr: (message) => io.stderr.write(message),
    });
  program
    .command('annotate <plan-file>')
    .description('Open a live PLAN.md in tuicr without saving a managed review')
    .option('--cwd <path>', 'Working directory for relative paths', process.cwd())
    .action(async (requested: string, options: { cwd: string }) => {
      const cwd = resolve(options.cwd);
      const path = resolve(cwd, requested);
      const selected = (await stat(path)).isDirectory() ? join(path, 'PLAN.md') : path;
      if (basename(selected) !== 'PLAN.md' || !(await stat(selected)).isFile()) {
        throw new Error(`Expected a PLAN.md file or its directory: ${requested}`);
      }
      const result = await planRuntime.execute('tuicr', ['--file', selected], cwd, true);
      if (result.code !== 0) throw new Error(result.stderr.trim() || `tuicr exited with status ${result.code}.`);
      io.stdout.write(`Opened ${selected} in tuicr; no managed review was saved.\n`);
    });
  return program;
}

export async function runPlanCli(args: string[], io: PlanCliIO = process): Promise<number> {
  const program = createPlanCliCommand(io);
  try {
    await program.parseAsync(['node', 'plan', ...args]);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }
}

export function planCliHelp(): string {
  return 'Usage:\n  diffpi plan annotate <PLAN.md|directory> [--cwd <path>]\n';
}
