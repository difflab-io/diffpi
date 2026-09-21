/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { checkConventionalSubject, ciGate, parseMiseTasks } from '../src/gates';

describe('parseMiseTasks', () => {
  it('discovers file tasks and every matching monorepo child task', () => {
    const tasks = parseMiseTasks(
      JSON.stringify([
        { name: '//:format:check', aliases: [] },
        { name: '//packages/api:lint', aliases: ['api:lint'] },
        { name: '//packages/web:lint', aliases: ['lint'] },
        { name: '//packages/api:test', aliases: [] },
        { name: '//packages/web:test', aliases: [] },
        { name: '//:deploy', aliases: [] },
      ]),
    );

    expect(tasks.get('format:check')).toEqual(['//:format:check']);
    expect(tasks.get('lint')).toEqual(['//packages/api:lint', '//packages/web:lint']);
    expect(tasks.get('test')).toEqual(['//packages/api:test', '//packages/web:test']);
  });

  it('returns no tasks for malformed mise output', () => {
    expect(parseMiseTasks('not json').size).toBe(0);
  });
});

describe('checkConventionalSubject', () => {
  it('accepts conventional subjects and warns on invalid subjects', () => {
    expect(checkConventionalSubject('feat: add review').status).toBe('pass');
    expect(checkConventionalSubject('add review').status).toBe('warn');
  });
});

describe('ciGate', () => {
  it('recognizes common terminal and pending forge statuses', () => {
    expect(ciGate('status: failed').detail).toBe('CI failing');
    expect(ciGate('conclusion: failure').detail).toBe('CI failing');
    expect(ciGate('status: running').detail).toBe('CI pending');
    expect(ciGate('status: success').status).toBe('pass');
  });

  it('classifies normalized status prefixes without interpreting check names', () => {
    expect(ciGate('pass: failure-mode tests\npass: error handling').status).toBe('pass');
    expect(ciGate('pass: failure-mode tests\npending: deploy').detail).toBe('CI pending');
    expect(ciGate('pass: error handling\nfail: deploy').detail).toBe('CI failing');
  });
});
