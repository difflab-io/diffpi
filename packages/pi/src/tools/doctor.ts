import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { doctorAgents } from '../doctor';

const parametersSchema = z.object({
  apply: z.boolean().default(false).describe('Back up and update stale global Diffpi agents. False only checks.'),
});

export const diffpiDoctorTool: ToolDefinition = defineTool({
  name: 'diffpi_doctor',
  label: 'diffpi doctor',
  description: 'Check or repair only global Diffpi agent profiles using this installed @difflab/pi package.',
  promptSnippet: 'Sync stale Diffpi agents without running full setup or changing unrelated settings',
  promptGuidelines: [
    'Call with apply=false to inspect before repair.',
    'Call with apply=true only when the user invokes Diffpi doctor or asks to repair local agent profiles.',
    'A changed profile needs a reload in affected Pi sessions; an existing inline system prompt may need a new conversation.',
  ],
  parameters: z.toJSONSchema(parametersSchema, { io: 'input' }) as ToolDefinition['parameters'],
  executionMode: 'sequential',
  async execute(_toolCallId, input, _signal, _onUpdate, ctx) {
    const { apply } = parametersSchema.parse(input);
    const result = await doctorAgents({ dryRun: !apply, availableModels: ctx.modelRegistry.getAvailable() });
    const lines = result.actions.map((action) => `${action.status.padEnd(9)} ${action.name}: ${action.detail}`);
    if (result.backups.length > 0) lines.push(`Backups: ${result.backups.join(', ')}`);
    if (apply && result.actions.some((action) => action.status === 'installed' || action.status === 'updated'))
      lines.push('Reload Pi in affected sessions; restart a conversation if an old inline prompt persists.');
    return {
      content: [
        { type: 'text', text: `${apply ? 'Agent sync complete.' : 'Agent sync preview.'}\n\n${lines.join('\n')}` },
      ],
      details: { result, changed: result.actions.some((action) => action.status !== 'ready') },
    };
  },
});
