import { defineTool, type ExtensionAPI, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';

// Schemas ---------------------------------------------------------------------

const reloadParametersSchema = z.object({});
const reloadParameters = z.toJSONSchema(reloadParametersSchema, { io: 'input' }) as ToolDefinition['parameters'];

// Tools -----------------------------------------------------------------------

export function createDiffpiReloadTool(pi: Pick<ExtensionAPI, 'sendUserMessage'>): ToolDefinition {
  return defineTool({
    name: 'diffpi_reload',
    label: 'diffpi reload',
    description: 'Reload pi extensions, skills, prompts, themes, and context files after setup changes.',
    promptSnippet: 'Reload pi after diffpi_setup installs or updates pi resources',
    promptGuidelines: [
      'Call diffpi_reload after diffpi_setup reports that pi resources changed.',
      'Do not call diffpi_reload after a read-only diffpi_validate run.',
    ],
    parameters: reloadParameters,
    executionMode: 'sequential',
    execute() {
      pi.sendUserMessage('/diffpi-reload', { deliverAs: 'followUp', expandPromptTemplates: true });
      return Promise.resolve({
        content: [{ type: 'text', text: 'Queued /diffpi-reload as a follow-up command.' }],
        details: {},
      });
    },
  });
}
