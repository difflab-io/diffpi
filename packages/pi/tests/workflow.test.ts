/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { loadPlanWorkflow } from '../src/workflow';

describe('bundled workflows', () => {
  it('loads one internal plan workflow with typed arguments', async () => {
    const prompt = await loadPlanWorkflow('new', {
      plan: 'demo',
      branch: 'feature/demo',
      background: false,
      prompt: 'Add caching.',
    });

    expect(prompt).toContain('/workflows/plan');
    expect(prompt).toContain('# new');
    expect(prompt).toContain('"plan": "demo"');
    expect(prompt).toContain('"prompt": "Add caching."');
    expect(prompt).not.toContain('name: plan');
  });
});
