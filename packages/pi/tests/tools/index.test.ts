/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { createModeController } from '../../src/modes';
import { createPiTools, diffpiSetupTool, diffpiValidateTool } from '../../src/tools';

describe('createPiTools', () => {
  it('exports the complete namespaced tool catalog', async () => {
    const messages: string[] = [];
    const events = { on: () => () => {}, emit: () => {} };
    const modes = createModeController(
      {
        appendEntry() {},
        getActiveTools: () => [],
        getAllTools: () => [],
        getThinkingLevel: () => 'medium',
        setActiveTools() {},
        setModel: async () => true,
        setThinkingLevel() {},
      },
      { agentDir: '/tmp/diffpi-agent', homeDir: '/tmp' },
    );
    const tools = createPiTools(
      {
        events,
        sendUserMessage(content) {
          if (typeof content === 'string') messages.push(content);
        },
      },
      modes,
    );
    const reloadTool = tools.find((tool) => tool.name === 'diffpi_reload');
    const modesStatusTool = tools.find((tool) => tool.name === 'diffpi_modes_status');

    expect(diffpiSetupTool.name).toBe('diffpi_setup');
    expect((diffpiSetupTool.parameters as { required?: string[] }).required).toBeUndefined();
    expect(diffpiValidateTool.name).toBe('diffpi_validate');
    expect(tools.map((tool) => tool.name)).toEqual([
      'diffpi_setup',
      'diffpi_validate',
      'diffpi_reload',
      'diffpi_log',
      'diffpi_template',
      'watch_ci',
      'diffpi_modes_status',
      'diffpi_modes_list',
      'diffpi_modes_set',
      'diffpi_modes_unset',
      'review_context',
      'review_status',
      'review_new',
      'review_open',
      'review_edit',
      'review_diff',
      'review_gates',
      'review_submit',
      'review_add_comment',
      'review_comments',
      'review_respond',
      'review_publish',
      'review_complete',
      'review_merge',
      'review_launch_ui',
    ]);
    expect(reloadTool).toBeDefined();

    await reloadTool?.execute('reload', {}, undefined, undefined, {} as never);
    expect(messages).toEqual(['/diffpi-reload']);

    const status = await modesStatusTool?.execute('status', {}, undefined, undefined, {} as never);
    expect(status?.details).toMatchObject({ activeTools: [], thinkingLevel: 'medium' });
  });
});
