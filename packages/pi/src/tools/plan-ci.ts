import { ciGate } from '../gates';

export interface CiWatchOptions {
  sha: string;
  timeoutSeconds: number;
  pollSeconds: number;
  loadChecks: () => Promise<string>;
}

export interface CiWatchRuntime {
  now: () => number;
  wait: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export async function watchCiSnapshots(
  options: CiWatchOptions,
  runtime: CiWatchRuntime,
  signal?: AbortSignal,
): Promise<{ status: 'passed' | 'failed' | 'skipped'; detail: string }> {
  const deadline = runtime.now() + options.timeoutSeconds * 1_000;
  const quietPeriod = Math.min(60_000, (options.timeoutSeconds * 1_000) / 2);
  let sawChecks = false;
  let candidate = '';
  let candidateSince = 0;
  let candidatePolls = 0;
  while (runtime.now() < deadline) {
    if (signal?.aborted) throw new Error('CI monitoring was cancelled.');
    const output = await options.loadChecks();
    const canonical = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right))
      .join('\n');
    if (canonical) sawChecks = true;
    const gate = ciGate(canonical);
    if (gate.detail === 'CI failing') return { status: 'failed', detail: gate.detail };
    if (gate.status === 'pass') {
      if (canonical === candidate) {
        candidatePolls += 1;
      } else {
        candidate = canonical;
        candidateSince = runtime.now();
        candidatePolls = 1;
      }
      if (candidatePolls >= 2 && runtime.now() - candidateSince >= quietPeriod)
        return { status: 'passed', detail: gate.detail };
    } else {
      candidate = '';
      candidateSince = 0;
      candidatePolls = 0;
    }
    const remaining = deadline - runtime.now();
    if (remaining <= 0) break;
    await runtime.wait(Math.min(options.pollSeconds * 1_000, remaining), signal);
  }
  return sawChecks
    ? {
        status: 'failed',
        detail: `CI did not settle within ${options.timeoutSeconds} seconds for ${options.sha}.`,
      }
    : {
        status: 'skipped',
        detail: `No CI checks appeared before the ${options.timeoutSeconds}-second timeout for ${options.sha}.`,
      };
}
