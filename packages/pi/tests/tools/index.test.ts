/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { createModeController } from '../../src/modes';
import { createPiTools, diffpiSetupTool, diffpiValidateTool } from '../../src/tools';

describe('createPiTools', () => {
  it('exports the complete namespaced tool catalog', async () => {
    const messages: string[] = [];
    const modes = createModeController({ appendEntry() {} }, { agentDir: '/tmp/diffpi-agent', homeDir: '/tmp' });
    const tools = createPiTools(
      {
        sendUserMessage(content) {
          if (typeof content === 'string') messages.push(content);
        },
      },
      modes,
    );
    const reloadTool = tools.find((tool) => tool.name === 'diffpi_reload');

    expect(diffpiSetupTool.name).toBe('diffpi_setup');
    expect((diffpiSetupTool.parameters as { required?: string[] }).required).toBeUndefined();
    expect(diffpiValidateTool.name).toBe('diffpi_validate');
    expect(tools.map((tool) => tool.name)).toEqual([
      'diffpi_setup',
      'diffpi_validate',
      'diffpi_reload',
      'diffpi_template',
      'diffpi_modes_list',
      'diffpi_modes_set',
      'diffpi_modes_unset',
      'review_context',
      'review_new',
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
      'plan_context',
      'plan_init',
      'plan_update_overview',
      'plan_add_phase',
      'plan_remove_phase',
      'plan_update_phase',
      'plan_validate',
      'plan_log_progress',
      'plan_update_status',
      'plan_run_gates',
      'plan_annotate',
      'plan_annotations',
      'plan_ack_annotations',
      'plan_start_execution',
    ]);
    expect(reloadTool).toBeDefined();

    await reloadTool?.execute('reload', {}, undefined, undefined, {} as never);
    expect(messages).toEqual(['/diffpi-reload']);
  });
});
