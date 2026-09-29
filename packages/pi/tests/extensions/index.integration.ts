/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import difflabPiExtension from '../../extensions/index';

describe('Diffpi extension registration', () => {
  it('ignores legacy mode entries without restoring tool snapshots', async () => {
    const activeTools = ['read', 'Agent', 'write'];
    let onSessionStart: ((...args: never[]) => unknown) | undefined;
    let onBeforeStart: ((...args: never[]) => unknown) | undefined;
    difflabPiExtension({
      registerTool() {},
      registerCommand() {},
      getAllTools: () => [{ name: 'ask_user_question' }],
      getActiveTools: () => activeTools,
      setActiveTools: () => {
        throw new Error('Legacy mode restored its tool snapshot');
      },
      on(event: string, handler: (...args: never[]) => unknown) {
        if (event === 'session_start') onSessionStart = handler;
        if (event === 'before_agent_start') onBeforeStart = handler;
      },
    } as unknown as ExtensionAPI);
    await onSessionStart?.(
      {} as never,
      {
        sessionManager: {
          getBranch: () => [
            { type: 'custom', customType: 'diffpi-mode-state', data: { active: { id: 'worker', tools: ['read'] } } },
          ],
        },
      } as never,
    );
    expect(activeTools).toEqual(['read', 'Agent', 'write']);
    expect(onBeforeStart?.({ systemPrompt: 'BASE' } as never)).toMatchObject({
      systemPrompt: expect.stringContaining('BASE'),
    });
  });
  it('registers the question tool when another extension has not provided it', async () => {
    const toolNames: string[] = [];
    const commandNames: string[] = [];
    let onSessionStart: ((...args: never[]) => unknown) | undefined;
    const extensionApi = {
      registerTool(tool: ToolDefinition) {
        toolNames.push(tool.name);
      },
      registerCommand(name: string) {
        commandNames.push(name);
      },
      getAllTools() {
        return toolNames.map((name) => ({ name }));
      },
      appendEntry() {},
      sendMessage() {},
      on(event: string, handler: (...args: never[]) => unknown) {
        if (event === 'session_start') onSessionStart = handler;
      },
    } as unknown as ExtensionAPI;

    difflabPiExtension(extensionApi);
    await onSessionStart?.({} as never, { sessionManager: { getBranch: () => [] }, ui: { setStatus() {} } } as never);

    expect(toolNames).toContain('ask_user_question');
    expect(toolNames).toContain('diffpi_setup');
    expect(toolNames).toContain('review_context');
    expect(toolNames).toContain('plan_verify');
    expect(toolNames.some((name) => name.startsWith('diffpi_modes_'))).toBe(false);
    expect(commandNames).toEqual(['diffpi-reload', 'review', 'plan']);
  });

  it('does not register the question tool when another extension provides it', async () => {
    const toolNames: string[] = [];
    let onSessionStart: ((...args: never[]) => unknown) | undefined;
    const extensionApi = {
      registerTool(tool: ToolDefinition) {
        toolNames.push(tool.name);
      },
      registerCommand() {},
      getAllTools() {
        return [{ name: 'ask_user_question' }];
      },
      appendEntry() {},
      sendMessage() {},
      on(event: string, handler: (...args: never[]) => unknown) {
        if (event === 'session_start') onSessionStart = handler;
      },
    } as unknown as ExtensionAPI;

    difflabPiExtension(extensionApi);
    await onSessionStart?.({} as never, { sessionManager: { getBranch: () => [] }, ui: { setStatus() {} } } as never);

    expect(toolNames).not.toContain('ask_user_question');
    expect(toolNames).toContain('diffpi_setup');
  });
});
