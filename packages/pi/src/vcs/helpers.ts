import type { ForgeProvider } from '../environment';
import type { CommandResult } from '../extensions/processx';

export function isConfirmedMissingChange(provider: ForgeProvider, output: string): boolean {
  const message = output.toLowerCase();
  return provider === 'github'
    ? message.includes('no pull requests found for branch') ||
        message.includes('could not find pull request') ||
        message.includes('could not resolve to a pullrequest')
    : provider === 'gitlab'
      ? message.includes('no open merge request') ||
        (/failed to get open merge request/.test(message) && /404(?: not found)?/.test(message))
      : false;
}

export function parseJson<T>(value: string, name: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`Cannot parse the ${name} response as JSON.`);
  }
}

export function commandFailure(command: string, args: string[], result: CommandResult): Error {
  return new Error(
    `${command} ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`}`,
  );
}

export function requireBranchName(output: string, provider: string): string {
  const branch = output.trim();
  if (!branch || branch === 'null') throw new Error(`${provider} did not return a default branch.`);
  return branch;
}
