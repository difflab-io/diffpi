/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { appendLog, readLogEntries } from '../src/log';

describe('Diffpi activity log', () => {
  it('creates nested parents and appends messages in order with optional labels', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-log-'));
    await appendLog(root, '.diffpi/plan/example/logs.jsonl', 'Started.');
    await appendLog(root, '.diffpi/plan/example/logs.jsonl', 'Finished.', 'milestone');
    const source = await Bun.file(resolve(root, '.diffpi/plan/example/logs.jsonl')).text();
    expect(source).toBe('{"message":"Started."}\n{"message":"Finished.","label":"milestone"}\n');
    await expect(lstat(join(root, '.diffpi/plan/example/logs'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readLogEntries(join(root, '.diffpi/plan/example/logs.jsonl'))).toEqual([
      { message: 'Started.' },
      { message: 'Finished.', label: 'milestone' },
    ]);
  });

  it('rejects absolute, traversal, and symlink escape targets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-log-'));
    const outside = await mkdtemp(join(tmpdir(), 'diffpi-log-outside-'));
    await expect(appendLog(root, '../outside.jsonl', 'nope')).rejects.toThrow();
    await expect(appendLog(root, join(outside, 'absolute.jsonl'), 'nope')).rejects.toThrow();
    await symlink(outside, join(root, 'link'));
    await expect(appendLog(root, 'link/escape.jsonl', 'nope')).rejects.toThrow();
    await expect(Bun.file(join(outside, 'escape.jsonl')).exists()).resolves.toBe(false);
  });

  it('accepts only paths within the managed store and never follows nested symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-log-'));
    const outside = await mkdtemp(join(tmpdir(), 'diffpi-log-outside-'));
    await appendLog(root, '.diffpi/plan/example/logs.jsonl', 'Started.');
    expect((await lstat(join(root, '.diffpi'))).isSymbolicLink()).toBe(true);
    const store = await realpath(join(root, '.diffpi'));
    await expect(appendLog(root, '.diffpi/../outside.jsonl', 'nope')).rejects.toThrow();
    await expect(appendLog(root, '.diffpi/plan/../../outside.jsonl', 'nope')).rejects.toThrow();
    await symlink(outside, join(store, 'escape'));
    await expect(appendLog(root, '.diffpi/escape/nested/new.jsonl', 'nope')).rejects.toThrow();
    await symlink(join(outside, 'leaf.jsonl'), join(store, 'leaf.jsonl'));
    await expect(appendLog(root, '.diffpi/leaf.jsonl', 'nope')).rejects.toThrow();
    expect(await Bun.file(join(outside, 'outside.jsonl')).exists()).toBe(false);
    expect(await Bun.file(join(outside, 'nested/new.jsonl')).exists()).toBe(false);
    expect(await Bun.file(join(outside, 'leaf.jsonl')).exists()).toBe(false);
  });

  it('reads legacy-shaped lines beside new entries without rewriting them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-log-'));
    const path = join(root, 'mixed.jsonl');
    await writeFile(path, '{"kind":"progress","actor":"worker","message":"legacy"}\n', 'utf8');
    await appendLog(root, 'mixed.jsonl', 'new');
    await expect(lstat(join(root, '.diffpi'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readLogEntries(path)).toEqual([
      { kind: 'progress', actor: 'worker', message: 'legacy' },
      { message: 'new' },
    ]);
  });

  it('reports malformed JSONL with its line number', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'diffpi-log-')), 'bad.jsonl');
    await writeFile(path, '{}\nnot-json\n', 'utf8');
    await expect(readLogEntries(path)).rejects.toThrow('line 2');
  });
});
