/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { parsePlanArgs, tokenizePlanArgs } from '../../src/plan/parser';

describe('plan command parser', () => {
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
});
