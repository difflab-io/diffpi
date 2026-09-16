import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import type { ModeCatalog, ModeController } from '../modes';

// Schemas ---------------------------------------------------------------------

const emptyParametersSchema = z.object({});
const emptyParameters = z.toJSONSchema(emptyParametersSchema, { io: 'input' }) as ToolDefinition['parameters'];
const listParametersSchema = z.object({
  includeSkills: z.boolean().optional().describe('Include skill-owned agents using skill:agent ids.'),
});
const listParameters = z.toJSONSchema(listParametersSchema, { io: 'input' }) as ToolDefinition['parameters'];
const setParametersSchema = z.object({
  agent: z.string().trim().min(1).describe('Inline agent id from diffpi_modes_list.'),
});
const setParameters = z.toJSONSchema(setParametersSchema, { io: 'input' }) as ToolDefinition['parameters'];

// Tools -----------------------------------------------------------------------

export function createModeTools(controller: ModeController): readonly ToolDefinition[] {
  return [
    defineTool({
      name: 'diffpi_modes_list',
      label: 'diffpi modes list',
      description: 'List inline agents shared with the subagent plugin, optionally including skill-owned agents.',
      promptSnippet: 'List inline agents before selecting one when the requested agent is unclear',
      promptGuidelines: [
        'Call diffpi_modes_list when the user asks which inline agents are available.',
        'Set includeSkills to true only when the user asks for skill agents or runs /skill:mode --include-skills.',
        'Agent frontmatter tool and model settings are informational only in inline mode; selection changes the system prompt, not the active model or tools.',
      ],
      parameters: listParameters,
      executionMode: 'parallel',
      async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
        const params = listParametersSchema.parse(input);
        const catalog = await controller.list(ctx, { includeSkills: params.includeSkills });
        return {
          content: [{ type: 'text', text: formatCatalog(catalog, controller.getActive()?.id) }],
          details: { active: controller.getActive()?.id, catalog },
        };
      },
    }),
    defineTool({
      name: 'diffpi_modes_set',
      label: 'diffpi modes set',
      description: 'Set a validated available agent as the inline behavioral agent for subsequent chat turns.',
      promptSnippet: 'Set the inline behavioral agent only after the user chooses one',
      promptGuidelines: [
        'Call diffpi_modes_set only after the user explicitly selects an agent.',
        'Use the exact skill:agent id for a skill-owned agent.',
        'The selected prompt takes effect on the next model turn.',
      ],
      parameters: setParameters,
      executionMode: 'sequential',
      async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
        const params = setParametersSchema.parse(input);
        const result = await controller.set(params.agent, ctx);
        if (!result.ok) throw new Error(result.message);
        return {
          content: [{ type: 'text', text: `${result.message} The prompt takes effect on the next turn.` }],
          details: { active: result.active },
        };
      },
    }),
    defineTool({
      name: 'diffpi_modes_unset',
      label: 'diffpi modes unset',
      description: 'Clear the inline behavioral agent and restore default Pi prompting for subsequent turns.',
      promptSnippet: 'Clear the inline agent when the user asks for default behavior',
      promptGuidelines: [
        'Call diffpi_modes_unset only when the user explicitly asks to clear the active inline agent.',
      ],
      parameters: emptyParameters,
      executionMode: 'sequential',
      execute(_toolCallId, input, _signal, _onUpdate, ctx) {
        emptyParametersSchema.parse(input);
        const result = controller.unset(ctx);
        return Promise.resolve({
          content: [{ type: 'text', text: result.message }],
          details: { active: controller.getActive()?.id },
        });
      },
    }),
  ];
}

// Formatting ------------------------------------------------------------------

function formatCatalog(catalog: ModeCatalog, active?: string): string {
  const lines = [`Active inline agent: ${active ?? 'default'}.`, '', 'Available inline agents:'];
  for (const mode of catalog.modes) {
    lines.push(`- ${mode.id} [${mode.promptStrategy}] — ${sanitize(mode.description)} (${mode.source})`);
  }
  if (catalog.diagnostics.length > 0) {
    lines.push('', 'Skipped agent files:');
    for (const diagnostic of catalog.diagnostics) lines.push(`- ${sanitize(diagnostic)}`);
  }
  lines.push('', 'Inline mode changes prompts only; it does not apply agent model or tool restrictions.');
  return lines.join('\n');
}

function sanitize(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
