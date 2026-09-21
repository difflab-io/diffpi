/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import type { EventBus } from '@earendil-works/pi-coding-agent';
import {
  launchBackgroundAgent,
  parseSubagentEscalation,
  renderSubagentEscalation,
  type SubagentEscalation,
} from '../../src/extensions/subagentx';

type RpcEventData = {
  requestId: string;
  type?: string;
  options?: { name?: string; isBackground?: boolean; cwd?: string; inheritContext?: boolean };
  prompt?: string;
};
type Handler = (data: unknown) => void;
function bus() {
  const handlers = new Map<string, Set<Handler>>();
  const emitted: Array<{ event: string; data: RpcEventData }> = [];
  return {
    emitted,
    on(event: string, handler: Handler) {
      const set = handlers.get(event) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(event, set);
      return () => set.delete(handler);
    },
    emit(event: string, data: unknown) {
      emitted.push({ event, data: data as RpcEventData });
      for (const handler of handlers.get(event) ?? []) handler(data);
    },
    reply(event: string, data: unknown) {
      for (const handler of handlers.get(event) ?? []) handler(data);
    },
  };
}

const options = {
  name: 'Plan go demo',
  agent: 'orchestrator' as const,
  cwd: '/tmp',
  prompt: 'execute',
  inheritContext: false,
};

describe('subagent extension adapter', () => {
  it('round-trips generic worker escalation payloads', () => {
    const escalation: SubagentEscalation = {
      correlation: {
        workflow: 'plan',
        executionId: 'execution-1',
        unitId: 'task-1',
        metadata: { planId: 'demo', phaseId: 'phase-1' },
      },
      blocker: 'Need a decision.',
      attempts: ['Read the API docs.'],
      evidence: ['No compatible API exists.'],
      needsUserDecision: true,
    };
    expect(parseSubagentEscalation(renderSubagentEscalation(escalation))).toEqual(escalation);
    expect(() => parseSubagentEscalation('missing')).toThrow('Missing');
  });

  it('contains no recursive Pi or /bg command path', async () => {
    const source = await Bun.file(new URL('../../src/extensions/subagentx.ts', import.meta.url)).text();
    expect(source).not.toContain('/bg');
    expect(source).not.toContain('pi --mode');
    expect(source).not.toContain('child_process');
  });

  it('pings and spawns one named background agent', async () => {
    const events = bus();
    const promise = launchBackgroundAgent(events as unknown as EventBus, options);
    const ping = events.emitted[0];
    events.reply(`subagents:rpc:ping:reply:${ping.data.requestId}`, { success: true, data: { version: 2 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const spawn = events.emitted[1];
    expect(spawn.event).toBe('subagents:rpc:spawn');
    expect(spawn.data.type).toBe('orchestrator');
    expect(spawn.data.options).toMatchObject({
      name: options.name,
      isBackground: true,
      cwd: '/tmp',
      inheritContext: false,
    });
    expect(spawn.data.prompt).toBe('execute');
    events.reply(`subagents:rpc:spawn:reply:${spawn.data.requestId}`, { success: true, data: { id: 'agent-1' } });
    await expect(promise).resolves.toMatchObject({ taskId: 'agent-1', queued: true });
  });

  it('reports unavailable and incompatible RPC services clearly', async () => {
    const unavailable = bus();
    const failed = launchBackgroundAgent(unavailable as unknown as EventBus, options);
    const request = unavailable.emitted[0];
    unavailable.reply(`subagents:rpc:ping:reply:${request.data.requestId}`, {
      success: false,
      error: 'No active session',
    });
    await expect(failed).rejects.toThrow('pi-subagents unavailable: No active session');

    const incompatible = bus();
    const wrong = launchBackgroundAgent(incompatible as unknown as EventBus, options);
    const ping = incompatible.emitted[0];
    incompatible.reply(`subagents:rpc:ping:reply:${ping.data.requestId}`, { success: true, data: { version: 1 } });
    await expect(wrong).rejects.toThrow('RPC version 2');
  });

  it('reports spawn failures and missing task ids', async () => {
    const failedBus = bus();
    const failed = launchBackgroundAgent(failedBus as unknown as EventBus, options);
    let request = failedBus.emitted[0];
    failedBus.reply(`subagents:rpc:ping:reply:${request.data.requestId}`, { success: true, data: { version: 2 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    request = failedBus.emitted[1];
    failedBus.reply(`subagents:rpc:spawn:reply:${request.data.requestId}`, {
      success: false,
      error: 'Model not found',
    });
    await expect(failed).rejects.toThrow('pi-subagents spawn failed: Model not found');

    const noIdBus = bus();
    const noId = launchBackgroundAgent(noIdBus as unknown as EventBus, options);
    request = noIdBus.emitted[0];
    noIdBus.reply(`subagents:rpc:ping:reply:${request.data.requestId}`, { success: true, data: { version: 2 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    request = noIdBus.emitted[1];
    noIdBus.reply(`subagents:rpc:spawn:reply:${request.data.requestId}`, { success: true, data: {} });
    await expect(noId).rejects.toThrow('no task id');
  });
});
