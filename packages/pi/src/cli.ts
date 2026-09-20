#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runPlanCli } from './cli/plan';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...args] = argv;
  if (command === '--help' || command === '-h' || !command) {
    process.stdout.write('Usage: diffpi plan <annotate|annotations> [options]\n');
    return 0;
  }
  if (command !== 'plan') throw new Error(`Unknown command: ${command}.`);
  return runPlanCli(args);
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
