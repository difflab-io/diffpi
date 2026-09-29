/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { createPiTools, diffpiSetupTool, diffpiValidateTool } from '../../src/tools';

describe('createPiTools', () => {
  it('exports non-mode tools directly without a controller', async () => {
    const messages: string[] = [];
    const tools = createPiTools({
      events: { on: () => () => {}, emit: () => {} },
      sendUserMessage(content) {
        if (typeof content === 'string') messages.push(content);
      },
    });
    expect(diffpiSetupTool.name).toBe('diffpi_setup');
    expect((diffpiSetupTool.parameters as { required?: string[] }).required).toBeUndefined();
    expect(diffpiValidateTool.name).toBe('diffpi_validate');
    expect(tools.map((tool) => tool.name)).toEqual([
      'diffpi_setup',
      'diffpi_validate',
      'diffpi_reload',
      'diffpi_log',
      'diffpi_template',
      'plan_verify',
      'watch_ci',
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
    expect(tools.some((tool) => tool.name.startsWith('diffpi_modes_'))).toBe(false);
    const reloadTool = tools.find((tool) => tool.name === 'diffpi_reload');
    await reloadTool?.execute('reload', {}, undefined, undefined, {} as never);
    expect(messages).toEqual(['/diffpi-reload']);
  });
});
