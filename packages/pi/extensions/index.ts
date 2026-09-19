import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import askUserQuestionExtension from '@juicesharp/rpiv-ask-user-question';
import { createModeController } from '../src/modes';
import { registerCommands } from '../src/commands';
import { createPiTools } from '../src/tools/index';

const SKILL_ROUTING_GUIDANCE = `## Skill and tool routing
Use the docs-search skill before web search for library or API documentation.
Use docs-manage when the required documentation is absent or stale.
Use fetch-url for a one-time read that does not belong in the documentation index.
Use the context-mode skill for commands, tests, builds, logs, API responses, and other output that can be large.
Use ctx_execute or ctx_execute_file to analyze that output, and use ctx_fetch_and_index with ctx_search for external documentation.`;

export default function difflabPiExtension(pi: ExtensionAPI): void {
  const modes = createModeController(pi);
  registerCommands(pi, modes);

  for (const tool of createPiTools(pi, modes)) pi.registerTool(tool);

  pi.on('session_start', async (_event, ctx) => {
    if (!pi.getAllTools().some((tool) => tool.name === 'ask_user_question')) askUserQuestionExtension(pi);
    await modes.restore(ctx);
  });
  pi.on('session_tree', async (_event, ctx) => modes.restore(ctx));
  pi.on('model_select', (_event, ctx) => modes.refresh(ctx));
  pi.on('before_agent_start', (event) => {
    const defaultPrompt = `${event.systemPrompt}\n\n${SKILL_ROUTING_GUIDANCE}`;
    return { systemPrompt: modes.apply(defaultPrompt) };
  });
}
