import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { resolveBundledAgentsDir } from '../assets';
import type { ModeController } from '../modes';
import { launchBackgroundPi } from './background';

const REVIEWER_VERBS = new Set(['address', 'auto', 'launch']);
const ORCHESTRATOR_AGENT_PATH = join(resolveBundledAgentsDir(), 'diffpi-orchestrator.md');

/** Register the review workflow command. */
export function registerReviewCommand(pi: ExtensionAPI, modes: ModeController): void {
  pi.registerCommand('review', {
    description: 'Code review: auto, new, edit, address, publish, complete, merge (add --local or --bg)',
    handler: async (args, ctx) => handleReviewCommand(args, ctx, pi, modes),
  });
}

async function handleReviewCommand(
  args: string,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  modes: ModeController,
): Promise<void> {
  const background = hasFlag(args, '--bg');
  const invocation = withoutFlag(args, '--bg') || 'help';
  const verb = reviewVerb(invocation);
  if (background) {
    await launchBackgroundPi(pi, {
      name: `Review ${verb}`,
      agentPath: ORCHESTRATOR_AGENT_PATH,
      model: 'openai-codex/gpt-5.6-luna',
      thinking: 'medium',
      cwd: ctx.cwd,
      prompt: reviewPrompt(invocation, 'orchestrator'),
    });
    return;
  }
  const agent = REVIEWER_VERBS.has(verb) ? 'reviewer' : 'orchestrator';
  const activation = await modes.set(agent, ctx);
  pi.sendMessage(
    {
      customType: 'diffpi-review-command',
      display: false,
      content: `${reviewPrompt(invocation, agent)} ${activation.message}`,
    },
    { triggerTurn: true },
  );
}

function reviewVerb(invocation: string): string {
  return invocation.split(/\s+/).find((token) => token && !token.startsWith('-')) ?? 'help';
}
function reviewPrompt(invocation: string, agent: 'orchestrator' | 'reviewer'): string {
  const routing =
    agent === 'reviewer'
      ? 'Coordinate this auto/address workflow. For address, classify every thread and delegate bounded edits to lightweight worker agents before collecting outcomes.'
      : 'Own this lifecycle workflow. Delegate review judgment to the reviewer only if the selected workflow requires it.';
  return `The user ran /review ${invocation}. Active inline agent: ${agent}. ${routing} Follow the review skill dispatcher. Call review_context first, then the matching review_* tools. Do not perform unrelated work.`;
}
function hasFlag(input: string, flag: string): boolean {
  return input.split(/\s+/).includes(flag);
}
function withoutFlag(input: string, flag: string): string {
  return input
    .split(/\s+/)
    .filter((token) => token && token !== flag)
    .join(' ')
    .trim();
}
