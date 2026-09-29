/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { assertCandidateCapabilities, backgroundEvidence } from './pi-provider';

const catalog = { skills: ['plan', 'review', 'diffpi-setup'], tools: ['Agent', 'get_subagent_result', 'plan_verify'] };

describe('candidate infrastructure gates', () => {
  it('requires the callable native catalog rather than a fabricated quality result', () => {
    expect(() => assertCandidateCapabilities(catalog, ['plan', 'review', 'diffpi-setup'])).not.toThrow();
    expect(() => assertCandidateCapabilities({ ...catalog, tools: ['Agent'] }, ['plan'])).toThrow(
      'Candidate missing callable tool(s): get_subagent_result, plan_verify',
    );
    expect(() => assertCandidateCapabilities({ ...catalog, skills: ['plan'] }, ['plan', 'review'])).toThrow(
      'Candidate missing package skill: review',
    );
  });

  it('requires an attached background launch and a completed child notification', () => {
    expect(backgroundEvidence('new', [], [])).toEqual({ started: false, completed: false });
    expect(backgroundEvidence('new', [{ step: 'new', status: 'completed' }], [])).toEqual({
      started: false,
      completed: false,
    });
    expect(backgroundEvidence('new', [{ step: 'new', status: 'background' }], [])).toEqual({
      started: true,
      completed: false,
    });
    expect(
      backgroundEvidence('new', [{ step: 'new', status: 'background' }], [{ step: 'new', status: 'stopped' }]),
    ).toEqual({ started: true, completed: false });
    expect(
      backgroundEvidence('new', [{ step: 'new', status: 'background' }], [{ step: 'new', status: 'completed' }]),
    ).toEqual({ started: true, completed: true });
    expect(
      backgroundEvidence('update', [{ step: 'new', status: 'background' }], [{ step: 'new', status: 'completed' }]),
    ).toEqual({ started: false, completed: false });
  });
});
