import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import askUserQuestionExtension from '@juicesharp/rpiv-ask-user-question';
import { createModeController } from '../src/modes';
import { createPiTools } from '../src/tools/index';

// Constants -------------------------------------------------------------------

const RELOAD_COMMAND = 'diffpi-reload';
const MODES_COMMAND = 'modes';
const MODE_PICKER_MESSAGE = 'diffpi-modes-picker';
const DOCS_ROUTING_GUIDANCE = `## Documentation routing
Use the docs-search skill before web search for library or API documentation.
Use docs-manage when the required documentation is absent or stale.
Use fetch-url for a one-time read that does not belong in the documentation index.`;

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

  pi.registerCommand(MODES_COMMAND, {
    description: 'Select an inline agent; add --include-skills for skill agents or use clear',
    handler: async (args, ctx) => {
      const request = parseModesArgs(args);
      if (request.error) {
        ctx.ui.notify(request.error, 'warning');
        return;
      }
      if (request.agent) {
        const result = request.agent.toLowerCase() === 'clear' ? modes.unset(ctx) : await modes.set(request.agent, ctx);
        ctx.ui.notify(result.message, result.ok ? 'info' : 'warning');
        return;
      }

      const catalog = await modes.list(ctx, { includeSkills: request.includeSkills });
      const ids = catalog.modes.map((mode) => mode.id);
      const skillScope = request.includeSkills
        ? 'skill agents are included and use skill:agent ids.'
        : 'skill agents are not included; the user can reopen with /modes --include-skills.';
      pi.sendMessage(
        {
          customType: MODE_PICKER_MESSAGE,
          display: false,
          content: `The user opened /modes without selecting an agent. ${skillScope} Call ask_user_question with one single-select question now. Offer up to four relevant choices, including Default (clear) when useful. Put this complete list of valid agent ids in the question text so the user can enter any id through the tool's custom-answer row: ${JSON.stringify(ids)}. After the answer, call diffpi_modes_unset for Default or clear; otherwise call diffpi_modes_set with the selected or typed id. Do not perform unrelated work.`,
        },
        { triggerTurn: true },
      );
    },
  });

  for (const tool of createPiTools(pi, modes)) pi.registerTool(tool);

  pi.on('session_start', (_event, ctx) => modes.restore(ctx));
  pi.on('session_tree', (_event, ctx) => modes.restore(ctx));
  pi.on('before_agent_start', (event) => {
    const defaultPrompt = `${event.systemPrompt}\n\n${DOCS_ROUTING_GUIDANCE}`;
    return { systemPrompt: modes.apply(defaultPrompt) };
  });
}

// Command parsing -------------------------------------------------------------

function parseModesArgs(args: string): { agent?: string; includeSkills: boolean; error?: string } {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  const includeSkills = tokens.includes('--include-skills');
  const unknownFlag = tokens.find((token) => token.startsWith('-') && token !== '--include-skills');
  if (unknownFlag) return { includeSkills, error: `Unknown /modes option: ${unknownFlag}.` };

  const agents = tokens.filter((token) => token !== '--include-skills');
  if (agents.length > 1) {
    return { includeSkills, error: 'Usage: /modes [--include-skills] [agent|clear]' };
  }
  return { agent: agents[0], includeSkills };
}
