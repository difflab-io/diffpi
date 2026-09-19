/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { checkConventionalSubject, parseMiseTasks } from '../src/gates';

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
