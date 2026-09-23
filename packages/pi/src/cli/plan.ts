import { Command, CommanderError } from 'commander';
import { resolve } from 'node:path';
import { runChecked } from '../extensions/processx';
import { createPlanStore, type PlanRecord, type PlanStore } from '../plan';
import { createPlanReview } from '../plan/reviews';

const plans = createPlanStore();

export interface PlanCliIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

interface PlanCliRuntime {
  context: PlanStore['context'];
  createPlanReview: typeof createPlanReview;
}

const runtime: PlanCliRuntime = { context: plans.context, createPlanReview };

export function createPlanCliCommand(io: PlanCliIO = process, planRuntime: PlanCliRuntime = runtime): Command {
  const program = new Command()
    .name('plan')
    .description('Plan review commands')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (message) => io.stdout.write(message),
      writeErr: (message) => io.stderr.write(message),
    });

  addReviewCommand(program, io, planRuntime);
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
  return 'Usage:\n  diffpi plan annotate [plan] [--cwd <path>]\n';
}

function addReviewCommand(program: Command, io: PlanCliIO, planRuntime: PlanCliRuntime): void {
  program
    .command('annotate [plan]')
    .description('Review a plan in tuicr and save the immutable plan review')
    .option('--cwd <path>', 'Repository working directory', process.cwd())
    .action(async (query: string | undefined, options: { cwd: string }) => {
      const cwd = resolve(options.cwd);
      const record = await resolveCliPlan(cwd, query, planRuntime);
      const result = await planRuntime.createPlanReview(record);
      io.stdout.write(`Saved review for ${record.id} to ${result.review.path}.\n`);
    });
}

async function resolveCliPlan(
  cwd: string,
  query: string | undefined,
  planRuntime: PlanCliRuntime,
): Promise<PlanRecord> {
  const branch = query ? undefined : (await runChecked('git', ['-C', cwd, 'branch', '--show-current'])).stdout.trim();
  const resolution = await planRuntime.context(
    cwd,
    query,
    query ? {} : { branch, statuses: ['draft', 'ready', 'in_progress', 'blocked'] },
  );
  if (resolution.record) return resolution.record;
  if (resolution.ambiguous)
    throw new Error(
      `Plan selection is ambiguous: ${resolution.candidates.map((candidate) => candidate.id).join(', ')}.`,
    );
  throw new Error(query ? `Plan "${query}" was not found.` : `No unfinished plan matches branch ${branch}.`);
}
