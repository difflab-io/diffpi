import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { z } from 'zod';
import { zx } from '../extensions/zodx';
import { appendLogEntry } from '../log';
import { logsDir } from '../store';

const schema = z
  .object({
    cwd: zx.cwd,
    channel: zx.id,
    kind: z.enum(['progress', 'issue', 'deviation']),
    actor: zx.text,
    message: zx.text,
    correlation: z.record(z.string(), z.string()).optional(),
    evidence: z.array(zx.text).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const diffpiLogTool: ToolDefinition = defineTool({
  name: 'diffpi_log',
  label: 'diffpi log',
  description: 'Append a reusable progress, issue, or deviation event to a project-scoped Diffpi JSONL channel.',
  promptSnippet: 'Use diffpi_log when a skill or workflow needs durable progress, issue, or deviation events.',
  promptGuidelines: [
    'Use stable channel names shared by one workflow, such as plan, flow, or session.',
    'Keep plan status transitions in plan tools; diffpi_log is a general activity log, not another task system.',
  ],
  parameters: z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'],
  executionMode: 'sequential',
  async execute(_id, input) {
    const params = schema.parse(input);
    const entry = await appendLogEntry(join(await logsDir(params.cwd ?? process.cwd()), `${params.channel}.jsonl`), {
      kind: params.kind,
      actor: params.actor,
      message: params.message,
      correlation: params.correlation,
      evidence: params.evidence,
      data: params.data,
    });
    return {
      content: [{ type: 'text' as const, text: `Logged ${entry.eventId} to ${params.channel}.` }],
      details: { entry, channel: params.channel },
    };
  },
});
