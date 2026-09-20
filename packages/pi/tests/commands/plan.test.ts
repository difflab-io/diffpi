/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { normalizeConversation } from '../../src/commands/background';
import { parsePlanArgs, tokenizePlanArgs } from '../../src/commands/plan';

describe('plan command parsing', () => {
  it('preserves quoted prompts and parses explicit execution policy', () => {
    expect(tokenizePlanArgs(`new demo "add a cache"`)).toEqual(['new', 'demo', 'add a cache']);
    expect(parsePlanArgs('go demo --bg --commit')).toEqual({
      verb: 'go',
      plan: 'demo',
      background: true,
      policy: 'commit-per-phase',
      instructions: '',
    });
  });

  it('rejects conflicting and unknown flags', () => {
    expect(() => parsePlanArgs('go demo --commit --no-commit')).toThrow('Conflicting');
    expect(() => parsePlanArgs('new demo --wat')).toThrow('Unknown flag');
  });

  it('normalizes only bounded user and assistant text', () => {
    const entries = [
      { type: 'message', message: { role: 'user', content: 'intent' } },
      { type: 'message', message: { role: 'toolResult', content: 'secret tool output' } },
      { type: 'custom', data: 'hidden' },
      { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'answer' }] } },
    ];
    expect(normalizeConversation(entries)).toEqual([
      { role: 'user', text: 'intent' },
      { role: 'assistant', text: 'answer' },
    ]);
  });
});
