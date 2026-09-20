import { Command, CommanderError } from 'commander';
import { resolve } from 'node:path';
import { runChecked } from '../extensions/processx';
import { annotatePlan, readPlanAnnotations, resolvePlan, type PlanRecord } from '../plan';

export interface PlanCliIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

export function createPlanCliCommand(io: PlanCliIO = process): Command {
  const program = new Command()
    .name('plan')
    .description('Plan annotation commands')
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (message) => io.stdout.write(message),
      writeErr: (message) => io.stderr.write(message),
    });

  addAnnotationCommand(program, 'annotate', io);
  addAnnotationCommand(program, 'annotations', io);
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
  return 'Usage:\n  diffpi plan annotate [plan] [--cwd <path>]\n  diffpi plan annotations [plan] [--cwd <path>]\n';
}

function addAnnotationCommand(program: Command, verb: 'annotate' | 'annotations', io: PlanCliIO): void {
  program
    .command(`${verb} [plan]`)
    .description(verb === 'annotate' ? 'Open a plan in tuicr for annotation' : 'Print plan annotations as JSON')
    .option('--cwd <path>', 'Repository working directory', process.cwd())
    .action(async (query: string | undefined, options: { cwd: string }) => {
      const cwd = resolve(options.cwd);
      const record = await resolveCliPlan(cwd, query);
      if (verb === 'annotate') {
        const result = await annotatePlan(record);
        io.stdout.write(`Annotated ${record.id} in tuicr session ${result.sessionSlug}.\\n`);
        return;
      }
      io.stdout.write(`${JSON.stringify(await readPlanAnnotations(record, { includeApplied: true }), null, 2)}\\n`);
    });
}

async function resolveCliPlan(cwd: string, query?: string): Promise<PlanRecord> {
  const branch = (await runChecked('git', ['-C', cwd, 'branch', '--show-current'])).stdout.trim();
  const resolution = await resolvePlan(
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
