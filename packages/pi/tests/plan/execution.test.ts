/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { createExecutionPacket, renderExecutionPrompt } from '../../src/plan/execution';
import type { PlanDocument } from '../../src/plan';

describe('plan execution helpers', () => {
  it('builds a durable packet and directs the orchestrator to SubagentWorkflow', () => {
    const document = {
      id: '260919-demo',
      execution: {
        id: 'run-1',
        active: true,
        policy: 'no-commit',
        cwd: '/repo',
        branch: 'feature/demo',
      },
    } as PlanDocument;
    const packet = createExecutionPacket(document, 'orchestrator');
    expect(packet).toMatchObject({ planId: '260919-demo', executionId: 'run-1', coordinator: 'orchestrator' });
    expect(renderExecutionPrompt(packet)).toContain('SubagentWorkflow');
    expect(renderExecutionPrompt(packet)).toContain('structured schemas');
    expect(renderExecutionPrompt(packet)).toContain('push immediately');
    expect(renderExecutionPrompt(packet)).toContain('background Worker');
    expect(renderExecutionPrompt(packet)).toContain('plan_watch_ci');
  });
});
