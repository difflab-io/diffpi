import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import askUserQuestionExtension from '@juicesharp/rpiv-ask-user-question';
import { createModeController } from '../src/modes';
import { createPiTools } from '../src/tools/index';

// Constants -------------------------------------------------------------------

const RELOAD_COMMAND = 'diffpi-reload';
const REVIEW_COMMAND = 'review';
const SKILL_ROUTING_GUIDANCE = `## Skill and tool routing
Use the docs-search skill before web search for library or API documentation.
Use docs-manage when the required documentation is absent or stale.
Use fetch-url for a one-time read that does not belong in the documentation index.
Use the context-mode skill for commands, tests, builds, logs, API responses, and other output that can be large.
Use ctx_execute or ctx_execute_file to analyze that output, and use ctx_fetch_and_index with ctx_search for external documentation.`;

// Extension -------------------------------------------------------------------

export default function difflabPiExtension(pi: ExtensionAPI): void {
  askUserQuestionExtension(pi);
  const modes = createModeController(pi);

  pi.registerCommand(RELOAD_COMMAND, {
    description: 'Reload extensions, skills, prompts, themes, and context files',
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });

  for (const tool of createPiTools(pi, modes)) pi.registerTool(tool);

  pi.registerCommand(REVIEW_COMMAND, {
    description: 'Code review: open, new, edit, address, publish, merge (add --local for tuicr)',
    handler: (args) => {
      const invocation = args.trim() || 'help';
      pi.sendMessage(
        {
          customType: 'diffpi-review-command',
          display: false,
          content: `The user ran /review ${invocation}. Follow the review skill dispatcher. Call review_context first, then the matching review_* tools. Do not perform unrelated work.`,
        },
        { triggerTurn: true },
      );
      return Promise.resolve();
    },
  });

  pi.on('session_start', async (_event, ctx) => modes.restore(ctx));
  pi.on('session_tree', async (_event, ctx) => modes.restore(ctx));
  pi.on('before_agent_start', (event) => {
    const defaultPrompt = `${event.systemPrompt}\n\n${SKILL_ROUTING_GUIDANCE}`;
    return { systemPrompt: modes.apply(defaultPrompt) };
  });
}
