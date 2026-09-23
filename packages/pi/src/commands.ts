import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { dryRun, type Runner } from './extensions/cmdtsx';
import { launchBackgroundAgent } from './extensions/subagentx';
import type { ModeController } from './modes';
import { loadPlanWorkflow, type PlanWorkflowArguments, type PlanWorkflowName } from './workflow';

// Types -----------------------------------------------------------------------

export type WorkflowAgent = 'planner' | 'orchestrator' | 'reviewer' | 'worker';

export type WorkflowRuntime = {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  modes: ModeController;
};

export type WorkflowInvocation = {
  [Name in PlanWorkflowName]: {
    workflow: Name;
    arguments: PlanWorkflowArguments[Name];
    agent?: WorkflowAgent;
    isBackground?: boolean;
  };
}[PlanWorkflowName];

// API -------------------------------------------------------------------------

export function tokenizeCommandArgs(raw: string): string[] {
  const tokens: string[] = [];
  let value = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  const push = () => {
    if (value) tokens.push(value);
    value = '';
  };
  for (const char of raw.trim()) {
    if (escaped) {
      value += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") escaped = true;
    else if (quote) {
      if (char === quote) quote = undefined;
      else value += char;
    } else if (char === '"' || char === "'") quote = char;
    else if (/\s/.test(char)) push();
    else value += char;
  }
  if (escaped || quote) throw new Error('Unterminated quote or escape.');
  push();
  return tokens;
}

export async function generateCommandHelp<Args, Result>(command: Runner<Args, Result>): Promise<string> {
  const result = await dryRun(command, ['--help']);
  if (result._tag === 'ok') return '';
  return result.error.replace(/\nprocess exited with status \d+ \([^)]*\)$/, '').trim();
}

export function createWorkflowInvoker(runtime: WorkflowRuntime) {
  return async function invokeWorkflow(invocation: WorkflowInvocation): Promise<void> {
    const { workflow, arguments: args, agent, isBackground = false } = invocation;
    const selectedAgent = agent ?? (isBackground ? 'orchestrator' : 'worker');
    const prompt = await loadPlanWorkflow(workflow, args);
    if (isBackground) {
      await launchBackgroundAgent(runtime.pi.events, {
        name: `plan ${workflow}`,
        agent: selectedAgent,
        cwd: runtime.ctx.cwd,
        inheritContext: true,
        prompt,
      });
      return;
    }
    const activation = await runtime.modes.set(selectedAgent, runtime.ctx);
    runtime.pi.sendMessage(
      {
        customType: `diffpi-plan-${workflow}-command`,
        display: false,
        content: `${prompt}\n\n${activation.message}`,
      },
      { triggerTurn: true },
    );
  };
}
