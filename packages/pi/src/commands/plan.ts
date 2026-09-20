import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { resolveBundledAgentsDir } from '../assets';
import { runChecked } from '../extensions/processx';
import type { ModeController } from '../modes';
import { createBackgroundPacket, launchBackgroundPi, normalizeConversation } from './background';

const PLANNER_PATH = join(resolveBundledAgentsDir(), 'diffpi-planner.md');
const ORCHESTRATOR_PATH = join(resolveBundledAgentsDir(), 'diffpi-orchestrator.md');
export { parsePlanArgs, tokenizePlanArgs, type PlanCommandRequest } from './plan-parser';
import { parsePlanArgs, type PlanCommandRequest } from './plan-parser';

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
    const branch = request.branch ?? (await currentBranch(ctx.cwd));
    const packet = await createBackgroundPacket(ctx.cwd, {
      cwd: ctx.cwd,
      branch,
      command: request,
      conversation: normalizeConversation(ctx.sessionManager.getBranch()),
    });
    await launchBackgroundPi(pi, {
      name: `Plan ${request.verb}`,
      agentPath: PLANNER_PATH,
      model: 'openai-codex/gpt-5.6-sol',
      thinking: 'high',
      cwd: ctx.cwd,
      packetPath: packet,
      prompt: `Run the plan skill ${request.verb} workflow non-interactively using context packet ${packet}. Do not ask questions. Persist unresolved ambiguity as a blocker.`,
    });
    return;
  }
  if (request.verb === 'go' && request.background && request.policy) {
    await launchBackgroundPi(pi, {
      name: `Plan go ${request.plan}`,
      agentPath: ORCHESTRATOR_PATH,
      model: 'openai-codex/gpt-5.6-luna',
      thinking: 'medium',
      cwd: ctx.cwd,
      prompt: planPrompt(request, 'orchestrator'),
    });
    return;
  }
  const directInlineGo = request.verb === 'go' && !request.background && request.policy;
  const agent = directInlineGo ? 'worker' : 'planner';
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

async function currentBranch(cwd: string): Promise<string> {
  return (await runChecked('git', ['-C', cwd, 'branch', '--show-current'])).stdout.trim();
}
