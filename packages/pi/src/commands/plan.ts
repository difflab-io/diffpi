import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';
import { launchBackgroundAgent } from '../extensions/subagentx';

export { parsePlanArgs, tokenizePlanArgs, type PlanCommandRequest } from '../plan/parser';
import { parsePlanArgs, type PlanCommandRequest } from '../plan/parser';

const PLANNER_VERBS = new Set<PlanCommandRequest['verb']>(['init', 'new', 'update']);

export function registerPlanCommand(pi: ExtensionAPI, modes: ModeController): void {
  pi.registerCommand('plan', {
    description: 'Durable planning: init, new, update, annotate, finalize, go, help',
    handler: async (args, ctx) => handlePlanCommand(args, ctx, pi, modes),
  });
}

async function handlePlanCommand(
  args: string,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  modes: ModeController,
): Promise<void> {
  let request: PlanCommandRequest;
  try {
    request = parsePlanArgs(args);
  } catch (error) {
    ctx.ui.notify((error as Error).message, 'error');
    return;
  }
  if (request.background && (request.verb === 'new' || request.verb === 'update')) {
    await launchBackgroundAgent(pi.events, {
      name: `Plan ${request.verb}`,
      agent: 'planner',
      cwd: ctx.cwd,
      inheritContext: true,
      prompt: `Run the plan skill ${request.verb} workflow non-interactively. Do not ask questions. Persist unresolved ambiguity as a blocker.`,
    });
    return;
  }
  if (request.verb === 'go' && request.background && !request.policy) {
    ctx.ui.notify(
      `Background execution requires an explicit commit policy. Run /plan go ${request.plan} --bg --commit or --no-commit.`,
      'error',
    );
    return;
  }
  if (request.verb === 'go' && request.background) {
    await launchBackgroundAgent(pi.events, {
      name: `Plan go ${request.plan}`,
      agent: 'orchestrator',
      cwd: ctx.cwd,
      inheritContext: false,
      prompt: `${planPrompt(request, 'orchestrator')} This orchestrator was already spawned for --bg. Call plan_start_execution with mode background and coordinator current, so this command creates exactly one background execution and does not spawn another agent.`,
    });
    return;
  }
  const agent = PLANNER_VERBS.has(request.verb) ? 'planner' : 'worker';
  const activation = await modes.set(agent, ctx);
  pi.sendMessage(
    {
      customType: 'diffpi-plan-command',
      display: false,
      content: `${planPrompt(request, agent)} ${activation.message}`,
    },
    { triggerTurn: true },
  );
}

function planPrompt(request: PlanCommandRequest, agent: string): string {
  const args: string[] = [request.verb];
  if (request.plan) args.push(request.plan);
  if ('branch' in request && request.branch) args.push('--branch', request.branch);
  if (request.verb === 'go' && request.policy)
    args.push(request.policy === 'commit-per-phase' ? '--commit' : '--no-commit');
  if (request.instructions) args.push(request.instructions);
  return `The user ran /plan ${args.join(' ')}. Active inline agent: ${agent}. Follow the plan skill dispatcher and use structured plan tools. Do not perform unrelated work.`;
}
