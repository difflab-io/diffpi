import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { piTools } from '../src/tools/index';

export default function difflabPiExtension(pi: ExtensionAPI): void {
  for (const tool of piTools) pi.registerTool(tool);

  pi.on('before_agent_start', async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${DOCS_ROUTING_GUIDANCE}`,
  }));
}

const DOCS_ROUTING_GUIDANCE = `## Documentation routing
Use the docs-search skill before web search for library or API documentation.
Use docs-manage when the required documentation is absent or stale.
Use fetch-url for a one-time read that does not belong in the documentation index.`;
