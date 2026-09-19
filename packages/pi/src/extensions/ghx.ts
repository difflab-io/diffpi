import { run, runChecked, type CommandOptions, type CommandResult } from './processx';

/** Process boundary for the GitHub CLI. Domain code should use this adapter. */
export function gh(args: string[], options?: CommandOptions): Promise<CommandResult> {
  return run('gh', args, options);
}

export function ghChecked(args: string[], options?: CommandOptions): Promise<CommandResult> {
  return runChecked('gh', args, options);
}
