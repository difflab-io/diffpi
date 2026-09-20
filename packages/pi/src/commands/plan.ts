import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { resolveBundledAgentsDir } from '../assets';
import { runChecked } from '../extensions/processx';
import type { ModeController } from '../modes';
import { createBackgroundPacket, launchBackgroundPi, normalizeConversation } from './background';

const PLANNER_PATH = join(resolveBundledAgentsDir(), 'diffpi-planner.md');
const ORCHESTRATOR_PATH = join(resolveBundledAgentsDir(), 'diffpi-orchestrator.md');
const HELP = 'Usage: /plan init|new|update|annotate|finalize|go|help. Run /plan help for exact grammar.';

type AuthorVerb = 'init' | 'new' | 'update' | 'annotate' | 'finalize' | 'help';
export type PlanCommandRequest =
  | { verb: AuthorVerb; plan?: string; branch?: string; background: boolean; instructions: string }
  | { verb: 'go'; plan: string; background: boolean; policy?: 'commit-per-phase' | 'no-commit'; instructions: '' };

export function registerPlanCommand(pi: ExtensionAPI, modes: ModeController): void {
  pi.registerCommand('plan', {
    description: 'Durable planning: init, new, update, annotate, finalize, go, help',
    handler: async (args, ctx) => handlePlanCommand(args, ctx, pi, modes),
  });
}

export function parsePlanArgs(raw: string): PlanCommandRequest {
  const tokens = tokenizePlanArgs(raw);
  const verb = (tokens.shift() ?? 'help') as PlanCommandRequest['verb'];
  if (!['init', 'new', 'update', 'annotate', 'finalize', 'go', 'help'].includes(verb))
    throw new Error(`Unknown plan verb: ${verb}. ${HELP}`);
  let branch: string | undefined;
  let background = false;
  let policy: 'commit-per-phase' | 'no-commit' | undefined;
  const positional: string[] = [];
  while (tokens.length) {
    const token = tokens.shift()!;
    if (token === '--branch') {
      if (branch) throw new Error(`Duplicate --branch. ${HELP}`);
      branch = tokens.shift();
      if (!branch || branch.startsWith('--')) throw new Error(`--branch requires a value. ${HELP}`);
    } else if (token === '--bg') {
      if (background) throw new Error(`Duplicate --bg. ${HELP}`);
      background = true;
    } else if (token === '--commit' || token === '--no-commit') {
      const next = token === '--commit' ? 'commit-per-phase' : 'no-commit';
      if (policy) throw new Error(`Conflicting or duplicate commit policy. ${HELP}`);
      policy = next;
    } else if (token.startsWith('--')) throw new Error(`Unknown flag: ${token}. ${HELP}`);
    else positional.push(token);
  }
  if (verb === 'go') {
    if (branch) throw new Error(`go does not accept --branch. ${HELP}`);
    if (positional.length !== 1) throw new Error(`go requires exactly one plan slug. ${HELP}`);
    return { verb, plan: positional[0]!, background, policy, instructions: '' };
  }
  if (policy) throw new Error(`${verb} does not accept a commit policy. ${HELP}`);
  if (verb === 'help') {
    if (positional.length || branch || background) throw new Error(`help does not accept arguments. ${HELP}`);
    return { verb, background: false, instructions: '' };
  }
  if (verb === 'init') {
    if (background || positional.length !== 1)
      throw new Error(`init requires one slug and does not accept --bg. ${HELP}`);
    return { verb, plan: positional[0], branch, background: false, instructions: '' };
  }
  if (verb === 'annotate' || verb === 'finalize') {
    if (background || branch || positional.length > 1)
      throw new Error(`${verb} accepts only an optional plan slug. ${HELP}`);
    return { verb, plan: positional[0], background: false, instructions: '' };
  }
  const plan = positional.shift();
  if (verb === 'new' && !plan) throw new Error(`new requires a plan slug. ${HELP}`);
  return { verb, plan, branch, background, instructions: positional.join(' ') };
}

export function tokenizePlanArgs(raw: string): string[] {
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
  if (escaped || quote) throw new Error(`Unterminated quote or escape. ${HELP}`);
  push();
  return tokens;
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
