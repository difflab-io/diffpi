import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { detectVcs } from '../environment';
import { zx } from '../extensions/zodx';
import { createVcsBackend } from '../vcs';

const watchCiParametersSchema = z
  .object({
    cwd: zx.cwd,
    sha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i),
    timeoutSeconds: z.number().int().min(30).max(7_200).default(1_800),
    pollSeconds: z.number().int().min(2).max(60).default(10),
  })
  .strict();

export const watchCiTool = defineTool({
  name: 'watch_ci',
  label: 'watch CI',
  description: 'Wait for hosted CI on an exact commit SHA without changing plan or review state.',
  parameters: z.toJSONSchema(watchCiParametersSchema, { io: 'input' }) as ToolDefinition['parameters'],
  executionMode: 'parallel',
  async execute(_id, input, signal) {
    const params = watchCiParametersSchema.parse(input);
    const cwd = params.cwd ?? process.cwd();
    const vcs = await detectVcs(cwd);
    if (vcs.provider === 'none') return result('CI skipped: No supported remote CI provider.', 'skipped');

    const timeoutSignal = AbortSignal.timeout(params.timeoutSeconds * 1_000);
    const watchSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    try {
      const settled = await createVcsBackend(vcs).watchCommitCi(params.sha, {
        intervalSeconds: params.pollSeconds,
        signal: watchSignal,
      });
      if (settled.status === 'pending')
        return result(
          `CI failed: CI did not settle within ${params.timeoutSeconds} seconds for ${params.sha}.`,
          'failed',
        );
      return result(`CI ${settled.status}: ${settled.detail}`, settled.status, settled.detail);
    } catch (error) {
      if (signal?.aborted) throw new Error('CI monitoring was cancelled.', { cause: error });
      if (timeoutSignal.aborted)
        return result(
          `CI failed: CI did not settle within ${params.timeoutSeconds} seconds for ${params.sha}.`,
          'failed',
        );
      throw error;
    }
  },
});

function result(text: string, status: 'passed' | 'failed' | 'skipped', detail = text) {
  return {
    content: [{ type: 'text' as const, text }],
    details: { status, detail },
  };
}
