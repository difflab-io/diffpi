import { run, runChecked, type CommandOptions, type CommandResult } from './processx';

/** Process boundary for the GitLab CLI. Domain code should use this adapter. */
export function glab(args: string[], options?: CommandOptions): Promise<CommandResult> {
  return run('glab', args, options);
}

export function glabChecked(args: string[], options?: CommandOptions): Promise<CommandResult> {
  return runChecked('glab', args, options);
}
