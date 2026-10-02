import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { zx } from '../extensions/zodx';
import { appendLog } from '../log';

const schema = z
  .object({
    cwd: zx.cwd,
    filename: z.string().trim().min(1),
    label: z.string().trim().min(1).optional(),
    message: zx.text,
  })
  .strict();

export const diffpiLogTool: ToolDefinition = defineTool({
  name: 'diffpi_log',
  label: 'diffpi log',
  description: 'Append a message to a caller-selected relative project JSONL file.',
  promptSnippet: 'Use diffpi_log to append durable progress messages to the supplied relative JSONL filename.',
  promptGuidelines: [
    'For /plan go, use cwd at the canonical Git root and filename .diffpi/plan/<plan-id>/logs.jsonl, directly beside PLAN.md.',
    'Use label only when a reusable category helps readers filter messages.',
  ],
  parameters: z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'],
  executionMode: 'sequential',
  async execute(_id, input) {
    const params = schema.parse(input);
    const entry = await appendLog(params.cwd ?? process.cwd(), params.filename, params.message, params.label);
    return {
      content: [{ type: 'text' as const, text: `Logged message to ${params.filename}.` }],
      details: { entry, filename: params.filename },
    };
  },
});
