import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveBundledWorkflowsDir } from './assets';

// Types -----------------------------------------------------------------------

export type PlanWorkflowName = 'init' | 'new' | 'update' | 'annotate' | 'finalize' | 'go' | 'help';
export type ReviewWorkflowName = 'auto' | 'new' | 'edit' | 'address' | 'publish' | 'complete' | 'merge' | 'help';

export type PlanWorkflowArguments = {
  init: { plan: string; branch?: string };
  new: { plan: string; branch?: string; background: boolean; prompt?: string };
  update: { plan?: string; branch?: string; background: boolean; instructions?: string };
  annotate: { plan?: string };
  finalize: { plan?: string };
  go: { plan: string; commitMode: 'no-commit' | 'commit' | 'push'; background: boolean };
  help: Record<string, never>;
};

export type ReviewWorkflowArguments = {
  auto: { target?: string; local: boolean; background: boolean };
  new: { title?: string; intent?: string; base?: string; local: boolean; background: boolean };
  edit: { target?: string; local: boolean; background: boolean };
  address: { target?: string; local: boolean; background: boolean };
  publish: {
    target?: string;
    comment: boolean;
    approve: boolean;
    requestChanges: boolean;
    close: boolean;
    background: boolean;
  };
  complete: {
    target?: string;
    local: boolean;
    approve: boolean;
    reject: boolean;
    abandon: boolean;
    background: boolean;
  };
  merge: { target?: string; background: boolean };
  help: Record<string, never>;
};

// API -------------------------------------------------------------------------

export function loadPlanWorkflow<Name extends PlanWorkflowName>(
  name: Name,
  args: PlanWorkflowArguments[Name],
): Promise<string> {
  return loadWorkflow('plan', name, args);
}

export function loadReviewWorkflow<Name extends ReviewWorkflowName>(
  name: Name,
  args: ReviewWorkflowArguments[Name],
): Promise<string> {
  return loadWorkflow('review', name, args);
}

// Core -----------------------------------------------------------------------

async function loadWorkflow(scope: string, name: string, args: unknown): Promise<string> {
  const workflowDir = join(resolveBundledWorkflowsDir(), scope);
  const content = await readFile(join(workflowDir, `${name}.md`), 'utf8');
  return [`Workflow directory: ${workflowDir}`, content.trim(), `Arguments:\n${JSON.stringify(args, null, 2)}`].join(
    '\n\n',
  );
}
