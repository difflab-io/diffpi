/// <reference types="bun" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'bun:test';
import { createPlanTools } from '../../src/tools/plan';

function statusTool(mode: 'inline' | 'background', unset: () => Promise<{ ok: boolean; message: string }>) {
  const store = {
    updateStatus: async () => ({
      record: { document: { execution: { mode } } },
      escalation: undefined,
    }),
  };
  const tools = createPlanTools(
    { events: {}, sendUserMessage() {} } as any,
    { set: async () => ({ ok: true, message: '' }), unset } as any,
    store as any,
  );
  return tools.find((tool) => tool.name === 'plan_update_status')!;
}

const completion = {
  plan: 'demo',
  target: { type: 'plan' as const },
  expectedStatus: 'in_progress' as const,
  status: 'completed' as const,
  actor: 'worker',
  message: 'Implementation complete.',
};

describe('plan status tool', () => {
  it('returns an inline execution to the default mode when the plan completes', async () => {
    let resets = 0;
    const tool = statusTool('inline', async () => {
      resets += 1;
      return { ok: true, message: 'Default mode restored.' };
    });

    await tool.execute('complete', completion, undefined, undefined, {} as never);

    expect(resets).toBe(1);
  });

  it('does not change the foreground mode when a background execution completes', async () => {
    let resets = 0;
    const tool = statusTool('background', async () => {
      resets += 1;
      return { ok: true, message: 'Default mode restored.' };
    });

    await tool.execute('complete', completion, undefined, undefined, {} as never);

    expect(resets).toBe(0);
  });
});
