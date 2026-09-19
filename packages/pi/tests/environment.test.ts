/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectIde, detectMux, detectShell, openInNewTab, parseRemote, screenWindowArgs } from '../src/environment';
import { ZED_PR_REVIEW_TASK_NAME, ZED_REVIEW_TASK_NAME } from '../src/extensions/zedx';

describe('detectIde', () => {
  it('detects supported IDEs and returns unknown for unsupported environments', () => {
    expect(detectIde({ ZED_TERM: 'true', TERM_PROGRAM: 'zed' })).toBe('zed');
    expect(detectIde({ TERM_PROGRAM: 'zed' })).toBe('zed');
    expect(detectIde({ CURSOR_TRACE_ID: 'x' })).toBe('cursor');
    expect(detectIde({ VSCODE_PID: '1' })).toBe('vscode');
    expect(detectIde({})).toBe('unknown');
  });
});

describe('detectMux', () => {
  it('detects supported multiplexers and returns none otherwise', () => {
    expect(detectMux({ ZELLIJ: '0' })).toBe('zellij');
    expect(detectMux({ TMUX: '/tmp/tmux-1/default,1,0' })).toBe('tmux');
    expect(detectMux({ STY: '1.pts' })).toBe('screen');
    expect(detectMux({})).toBe('none');
  });
});

describe('detectShell', () => {
  it('reads the shell basename or returns unknown', () => {
    expect(detectShell({ SHELL: '/bin/zsh' })).toBe('zsh');
    expect(detectShell({})).toBe('unknown');
  });
});

describe('openInNewTab', () => {
  it('reports a configured Zed task without claiming it launched', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const result = await openInNewTab(['tuicr', '-w', '-r', 'main..HEAD'], {
      cwd: '.',
      env: { ZED_TERM: 'true' },
      homeDir,
    });

    expect(result).toMatchObject({
      launched: false,
      configured: true,
      via: 'zed-task',
      command: 'tuicr -w -r main..HEAD',
      taskName: ZED_REVIEW_TASK_NAME,
      instruction: `Run the Zed task "${ZED_REVIEW_TASK_NAME}".`,
    });
    const tasks = JSON.parse(await readFile(join(homeDir, '.config', 'zed', 'tasks.json'), 'utf8')) as Array<{
      label: string;
      args?: string[];
    }>;
    expect(tasks.find((task) => task.label === ZED_REVIEW_TASK_NAME)?.args?.[0]).toBe('-lc');
  });

  it('selects the stable PR task without rewriting exact argv', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const result = await openInNewTab(['tuicr', 'pr', '42'], {
      cwd: '.',
      env: { ZED_TERM: 'true' },
      homeDir,
    });
    expect(result.taskName).toBe(ZED_PR_REVIEW_TASK_NAME);
    expect(result.instruction).toBe(`Run the Zed task "${ZED_PR_REVIEW_TASK_NAME}".`);
    const tasks = JSON.parse(await readFile(join(homeDir, '.config', 'zed', 'tasks.json'), 'utf8')) as Array<{
      label: string;
      args?: string[];
    }>;
    expect(tasks.find((task) => task.label === ZED_PR_REVIEW_TASK_NAME)?.args?.[0]).toBe('-lc');
  });

  it('returns the exact command for unsupported IDE and mux environments', async () => {
    expect(await openInNewTab(['tuicr', '-w', '-r', 'main..HEAD'], { cwd: '/tmp/project', env: {} })).toEqual({
      launched: false,
      via: 'print',
      command: 'tuicr -w -r main..HEAD',
    });
  });
});

describe('screenWindowArgs', () => {
  it('changes to the requested repository before starting the command', () => {
    expect(screenWindowArgs(['tuicr', '-w', '-r', 'main..HEAD'], '/work/repo', 'tuicr')).toEqual([
      '-X',
      'screen',
      '-t',
      'tuicr',
      'sh',
      '-lc',
      'cd -- "$1" && shift && exec "$@"',
      'sh',
      '/work/repo',
      'tuicr',
      '-w',
      '-r',
      'main..HEAD',
    ]);
  });
});

describe('parseRemote', () => {
  it('parses supported remotes and marks unsupported remotes as none', () => {
    expect(parseRemote('git@github.com:difflab-io/diffpi.git')).toMatchObject({
      provider: 'github',
      host: 'github.com',
      owner: 'difflab-io',
      repo: 'diffpi',
    });
    expect(parseRemote('https://gitlab.com/group/sub/app.git')).toMatchObject({
      provider: 'gitlab',
      owner: 'group/sub',
      repo: 'app',
    });
    expect(parseRemote('https://code.example.com/group/app.git')).toMatchObject({ provider: 'none' });
    expect(parseRemote('')).toMatchObject({ provider: 'none' });
  });
});
