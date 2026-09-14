import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import askUserQuestionExtension from '@juicesharp/rpiv-ask-user-question';
import { createPiTools } from '../src/tools/index';

// Constants -------------------------------------------------------------------

const RELOAD_COMMAND = 'diffpi-reload';
const DOCS_ROUTING_GUIDANCE = `## Documentation routing
Use the docs-search skill before web search for library or API documentation.
Use docs-manage when the required documentation is absent or stale.
Use fetch-url for a one-time read that does not belong in the documentation index.`;

// Extension -------------------------------------------------------------------

export default function difflabPiExtension(pi: ExtensionAPI): void {
  askUserQuestionExtension(pi);

  pi.registerCommand(RELOAD_COMMAND, {
    description: 'Reload extensions, skills, prompts, themes, and context files',
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });

  for (const tool of createPiTools(pi)) pi.registerTool(tool);

  pi.on('before_agent_start', (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${DOCS_ROUTING_GUIDANCE}`,
  }));
}
