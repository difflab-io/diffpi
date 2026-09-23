import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveBundledWorkflowsDir } from './assets';

// Types -----------------------------------------------------------------------

export type PlanWorkflowName = 'init' | 'new' | 'update' | 'annotate' | 'finalize' | 'go' | 'help';

export type PlanWorkflowArguments = {
  init: { plan: string; branch?: string };
  new: { plan: string; branch?: string; background: boolean; prompt?: string };
  update: { plan?: string; branch?: string; background: boolean; instructions?: string };
  annotate: { plan?: string };
  finalize: { plan?: string };
  go: { plan: string; commitMode: 'no-commit' | 'commit' | 'push'; background: boolean };
  help: Record<string, never>;
};

// API -------------------------------------------------------------------------

export async function loadPlanWorkflow<Name extends PlanWorkflowName>(
  name: Name,
  args: PlanWorkflowArguments[Name],
): Promise<string> {
  const workflowDir = join(resolveBundledWorkflowsDir(), 'plan');
  const content = await readFile(join(workflowDir, `${name}.md`), 'utf8');
  return [`Workflow directory: ${workflowDir}`, content.trim(), `Arguments:\n${JSON.stringify(args, null, 2)}`].join(
    '\n\n',
  );
}
