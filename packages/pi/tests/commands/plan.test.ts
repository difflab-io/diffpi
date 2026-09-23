/// <reference types="bun" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'bun:test';
import { registerPlanCommand } from '../../src/commands/plan';

describe('plan command', () => {
  it('routes foreground authoring to Planner, execution to Orchestrator, and other workflows to Worker', async () => {
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
    for (const invocation of ['annotate demo', 'finalize demo', 'go demo --mode commit', 'help'])
      await handler(invocation, ctx);

    expect(selected).toEqual(['planner', 'planner', 'planner', 'worker', 'worker', 'orchestrator', 'worker']);
    expect(messages).toHaveLength(7);
  });

  it('generates cmd-ts help when parsing fails', async () => {
    let handler!: (args: string, ctx: any) => Promise<void>;
    const notices: string[] = [];
    const pi = {
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
    };
    registerPlanCommand(pi as any, { set: async () => ({ ok: true, message: '' }) } as any);

    await handler('new demo --unknown', {
      cwd: '/tmp',
      ui: {
        notify(message: string) {
          notices.push(message);
        },
      },
    });

    expect(notices[0]).toContain('plan <subcommand>');
    expect(notices[0]).toContain('new');
  });

  it('rejects an unsupported commit mode before changing the foreground mode', async () => {
    let handler!: (args: string, ctx: any) => Promise<void>;
    const selected: string[] = [];
    const notices: string[] = [];
    const pi = {
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
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

    await handler('go demo --mode unsupported', {
      cwd: '/tmp',
      ui: {
        notify(message: string) {
          notices.push(message);
        },
      },
    });

    expect(selected).toEqual([]);
    expect(notices[0]).toContain('no-commit');
    expect(notices[0]).toContain('commit');
    expect(notices[0]).toContain('push');
  });

  it('dispatches the background go workflow with explicit background arguments', async () => {
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

    const pending = handler('go demo --bg --mode push', { cwd: '/tmp', ui: { notify() {} } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ping = emitted[0];
    handlers.get(`subagents:rpc:ping:reply:${ping.data.requestId}`)?.({ success: true, data: { version: 2 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const spawns = emitted.filter((item) => item.event === 'subagents:rpc:spawn');
    expect(spawns).toHaveLength(1);
    expect(spawns[0].data.type).toBe('orchestrator');
    expect(spawns[0].data.prompt).toContain('"commitMode": "push"');
    expect(spawns[0].data.prompt).toContain('"background": true');
    handlers.get(`subagents:rpc:spawn:reply:${spawns[0].data.requestId}`)?.({
      success: true,
      data: { id: 'execution-1' },
    });
    await pending;
  });
});
