#!/usr/bin/env node
import { Command, CommanderError } from 'commander';
import { pathToFileURL } from 'node:url';
import { createPlanCliCommand, type PlanCliIO } from './cli/plan';

export async function main(argv = process.argv.slice(2), io: PlanCliIO = process): Promise<number> {
  const program = new Command()
    .name('diffpi')
    .description('Diffpi command-line tools')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (message) => io.stdout.write(message),
      writeErr: (message) => io.stderr.write(message),
    });
  program.addCommand(createPlanCliCommand(io));
  try {
    await program.parseAsync(['node', 'diffpi', ...argv]);
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) return error.exitCode;
    throw error;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`diffpi: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
