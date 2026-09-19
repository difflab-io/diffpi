import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { resolveBundledAgentsDir } from '../assets';
import type { ModeController } from '../modes';

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
    const name = `Review ${verb}`;
    const prompt = reviewPrompt(invocation, 'orchestrator');
    const command = shellCommand([
      'pi',
      '--mode',
      'json',
      '--print',
      '--no-session',
      '--offline',
      '--approve',
      '--model',
      'openai-codex/gpt-5.6-luna',
      '--thinking',
      'medium',
      '--append-system-prompt',
      ORCHESTRATOR_AGENT_PATH,
      '--',
      prompt,
    ]);
    await pi.sendUserMessage(`/bg --agent --name ${shellQuote(name)} -- ${command}`, {
      deliverAs: 'followUp',
      expandPromptTemplates: true,
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
function shellCommand(args: readonly string[]): string {
  return args.map(shellQuote).join(' ');
}
function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}
