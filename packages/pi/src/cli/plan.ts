import { resolve } from 'node:path';
import { annotatePlan, readPlanAnnotations, resolvePlan, type PlanRecord } from '../plan';
import { runChecked } from '../extensions/processx';

export interface PlanCliIO {
  stdout: Pick<NodeJS.WriteStream, 'write'>;
  stderr: Pick<NodeJS.WriteStream, 'write'>;
}

export async function runPlanCli(args: string[], io: PlanCliIO = process): Promise<number> {
  const verb = args.shift();
  if (verb === '--help' || verb === '-h' || !verb) {
    io.stdout.write(planCliHelp());
    return 0;
  }
  if (verb !== 'annotate' && verb !== 'annotations')
    throw new Error(`Unknown plan command: ${verb}.\n${planCliHelp()}`);
  if (args.includes('--help') || args.includes('-h')) {
    io.stdout.write(`Usage: diffpi plan ${verb} [plan] [--cwd <path>]\n`);
    return 0;
  }
  let cwd = process.cwd();
  let query: string | undefined;
  while (args.length) {
    const token = args.shift()!;
    if (token === '--cwd') {
      const value = args.shift();
      if (!value || value.startsWith('--')) throw new Error('--cwd requires a path.');
      cwd = resolve(value);
    } else if (token.startsWith('--')) throw new Error(`Unknown option: ${token}.`);
    else if (query) throw new Error(`Unexpected argument: ${token}.`);
    else query = token;
  }
  const record = await resolveCliPlan(cwd, query);
  if (verb === 'annotate') {
    const result = await annotatePlan(record);
    io.stdout.write(`Annotated ${record.id} in tuicr session ${result.sessionSlug}.\n`);
    return result.code;
  }
  io.stdout.write(`${JSON.stringify(await readPlanAnnotations(record, { includeApplied: true }), null, 2)}\n`);
  return 0;
}

export function planCliHelp(): string {
  return 'Usage:\n  diffpi plan annotate [plan] [--cwd <path>]\n  diffpi plan annotations [plan] [--cwd <path>]\n';
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
