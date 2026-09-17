import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { setupPi, type SetupResult } from '../setup';

// Schemas ---------------------------------------------------------------------

const setupParametersSchema = z.object({
  issueTracker: z
    .enum(['none', 'linear', 'jira'])
    .default('none')
    .describe('Issue tracker MCP server to configure. Use none unless the user explicitly selects Linear or Jira.'),
});
const setupParameters = z.toJSONSchema(setupParametersSchema, { io: 'input' }) as ToolDefinition['parameters'];

// Tools -----------------------------------------------------------------------

export const diffpiSetupTool: ToolDefinition = defineTool({
  name: 'diffpi_setup',
  label: 'diffpi setup',
  description:
    'Install or repair the @difflab/pi environment. This mutates user-level tool installations and configuration files.',
  promptSnippet: 'Install or repair @difflab/pi only after the user approves the setup choices',
  promptGuidelines: [
    'Call diffpi_setup only when the user explicitly asks to install, configure, or repair the environment.',
    'Use ask_user_question for unspecified setup choices before calling diffpi_setup.',
    'Call diffpi_setup with issueTracker="none" unless the user explicitly selects Linear or Jira.',
    'Use diffpi_validate instead of diffpi_setup when the user asks only to inspect or verify setup.',
  ],
  parameters: setupParameters,
  executionMode: 'sequential',
  async execute(_toolCallId, input, _signal, onUpdate, ctx) {
    const params = setupParametersSchema.parse(input);
    const result = await setupPi({
      issueTracker: params.issueTracker,
      installMiseHook: true,
      availableModels: ctx.modelRegistry.getAvailable(),
      onProgress(message) {
        onUpdate?.({ content: [{ type: 'text', text: message }], details: {} });
      },
    });

    return formatResult(result, 'Setup complete.');
  },
});

export const diffpiValidateTool: ToolDefinition = defineTool({
  name: 'diffpi_validate',
  label: 'diffpi validate',
  description: 'Inspect the @difflab/pi environment without installing software or changing configuration files.',
  promptSnippet: 'Validate @difflab/pi safely before setup or when the user asks for an environment check',
  promptGuidelines: [
    'Prefer diffpi_validate before diffpi_setup when the requested action is unclear.',
    'diffpi_validate is read-only; do not describe its planned actions as completed changes.',
    'Call diffpi_validate with issueTracker="none" unless the user asks to validate Linear or Jira configuration.',
  ],
  parameters: setupParameters,
  executionMode: 'sequential',
  async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
    const params = setupParametersSchema.parse(input);
    const result = await setupPi({
      issueTracker: params.issueTracker,
      installMiseHook: true,
      dryRun: true,
      availableModels: ctx.modelRegistry.getAvailable(),
    });
    const incomplete = result.actions.some((item) => item.status === 'planned');
    return formatResult(result, incomplete ? 'Setup is incomplete.' : 'Setup is ready.');
  },
});

// Utils -----------------------------------------------------------------------

function formatResult(result: SetupResult, heading: string) {
  const changed = result.actions.some(
    (item) => item.status === 'installed' || item.status === 'updated' || item.status === 'planned',
  );
  const lines = result.actions.map((item) => `${item.status.padEnd(9)} ${item.name}: ${item.detail}`);
  if (result.restartPi) lines.push('Restart pi to load package, skill, and MCP changes.');

  return {
    content: [{ type: 'text' as const, text: `${heading}\n\n${lines.join('\n')}` }],
    details: { changed, result },
  };
}
