/// <reference types="bun" />

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { detectIde, detectMux, detectShell, openInNewTab, parseRemote, screenWindowArgs } from '../src/environment';
import { ZED_REVIEW_TASK_NAME } from '../src/zed';

describe('environment detectors', () => {
  it('detects Zed from ZED_TERM and TERM_PROGRAM', () => {
    expect(detectIde({ ZED_TERM: 'true', TERM_PROGRAM: 'zed' })).toBe('zed');
    expect(detectIde({ TERM_PROGRAM: 'zed' })).toBe('zed');
  });

  it('distinguishes vscode-family IDEs', () => {
    expect(detectIde({ CURSOR_TRACE_ID: 'x' })).toBe('cursor');
    expect(detectIde({ VSCODE_PID: '1' })).toBe('vscode');
    expect(detectIde({})).toBe('unknown');
  });

  it('detects the multiplexer purely from env', () => {
    expect(detectMux({ ZELLIJ: '0' })).toBe('zellij');
    expect(detectMux({ TMUX: '/tmp/tmux-1/default,1,0' })).toBe('tmux');
    expect(detectMux({ STY: '1.pts' })).toBe('screen');
    expect(detectMux({})).toBe('none');
  });

  it('reads the shell basename', () => {
    expect(detectShell({ SHELL: '/bin/zsh' })).toBe('zsh');
    expect(detectShell({})).toBe('unknown');
  });

  it('reports a configured Zed task without claiming it launched', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-zed-'));
    const result = await openInNewTab(['tuicr', '-w'], {
      cwd: '.',
      env: { ZED_TERM: 'true' },
      homeDir,
    });

    expect(result).toMatchObject({
      launched: false,
      configured: true,
      via: 'zed-task',
      command: 'tuicr -w',
      taskName: ZED_REVIEW_TASK_NAME,
      instruction: `Run the Zed task "${ZED_REVIEW_TASK_NAME}".`,
    });
    expect(await readFile(join(homeDir, '.config', 'zed', 'tasks.json'), 'utf8')).toContain(ZED_REVIEW_TASK_NAME);
  });

  it('starts screen commands through a shell that changes to the requested directory', () => {
    expect(screenWindowArgs(['tuicr', '-w'], '/work/repo', 'tuicr')).toEqual([
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
    ]);
  });

  it('parses ssh and https remotes into a provider', () => {
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
    expect(parseRemote('')).toMatchObject({ provider: 'none' });
  });
});
