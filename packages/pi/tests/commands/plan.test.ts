/// <reference types="bun" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'bun:test';
import { registerPlanCommand } from '../../src/commands/plan';

describe('plan command', () => {
  it('uses Planner only for foreground authoring and Worker for every other foreground workflow', async () => {
    let handler!: (args: string, ctx: any) => Promise<void>;
    const selected: string[] = [];
    const messages: unknown[] = [];
    const pi = {
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
      sendMessage(message: unknown) {
        messages.push(message);
      },
    };
    registerPlanCommand(
      pi as any,
      {
        set: async (agent: string) => {
          selected.push(agent);
          return { ok: true, message: '' };
        },
      } as any,
    );
    const ctx = { cwd: '/tmp', ui: { notify() {} } };

    for (const invocation of ['init demo', 'new demo', 'update demo clarify scope']) await handler(invocation, ctx);
    for (const invocation of ['annotate demo', 'finalize demo', 'go demo --commit', 'help'])
      await handler(invocation, ctx);

    expect(selected).toEqual(['planner', 'planner', 'planner', 'worker', 'worker', 'worker', 'worker']);
    expect(messages).toHaveLength(7);
  });

  it('rejects background go without changing the foreground mode when commit policy is missing', async () => {
    let handler!: (args: string, ctx: any) => Promise<void>;
    const selected: string[] = [];
    const notices: string[] = [];
    const emitted: unknown[] = [];
    const pi = {
      events: {
        on() {},
        emit(_event: string, data: unknown) {
          emitted.push(data);
        },
      },
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
      sendMessage() {},
    };
    registerPlanCommand(
      pi as any,
      {
        set: async (agent: string) => {
          selected.push(agent);
          return { ok: true, message: '' };
        },
      } as any,
    );

    await handler('go demo --bg', {
      cwd: '/tmp',
      ui: {
        notify(message: string) {
          notices.push(message);
        },
      },
    });

    expect(selected).toEqual([]);
    expect(emitted).toEqual([]);
    expect(notices[0]).toContain('/plan go demo --bg --commit or --no-commit');
  });

  it('spawns exactly one orchestrator for background go with current coordination', async () => {
    const handlers = new Map<string, (data: unknown) => void>();
    const emitted: Array<{
      event: string;
      data: { requestId: string; type?: string; prompt?: string };
    }> = [];
    const events = {
      on(event: string, handler: (data: unknown) => void) {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      },
      emit(event: string, data: unknown) {
        emitted.push({ event, data: data as { requestId: string; type?: string; prompt?: string } });
      },
    };
    let handler!: (args: string, ctx: any) => Promise<void>;
    const pi = {
      events,
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
    };
    registerPlanCommand(pi as any, { set: async () => ({ ok: true, message: '' }) } as any);

    const pending = handler('go demo --bg --commit', { cwd: '/tmp', ui: { notify() {} } });
    const ping = emitted[0];
    handlers.get(`subagents:rpc:ping:reply:${ping.data.requestId}`)?.({ success: true, data: { version: 2 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const spawns = emitted.filter((item) => item.event === 'subagents:rpc:spawn');
    expect(spawns).toHaveLength(1);
    expect(spawns[0].data.type).toBe('orchestrator');
    expect(spawns[0].data.prompt).toContain('mode background and coordinator current');
    handlers.get(`subagents:rpc:spawn:reply:${spawns[0].data.requestId}`)?.({
      success: true,
      data: { id: 'execution-1' },
    });
    await pending;
  });
});
