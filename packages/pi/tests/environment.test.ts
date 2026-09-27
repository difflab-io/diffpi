/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectIde,
  detectMux,
  detectShell,
  diffpiLaunchName,
  openFileAdjacent,
  openInNewTab,
  parseRemote,
  persistentEditorArgs,
  resolveEditor,
  screenWindowArgs,
} from '../src/environment';
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

describe('diffpiLaunchName', () => {
  it('includes the project and workflow in mux titles', () => {
    expect(diffpiLaunchName('/work/diffpi', 'PR #4')).toBe('diffpi: diffpi / PR #4');
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

describe('editor resolution', () => {
  it('prefers a Zellij editor tab over an IDE launcher', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi editor priority '));
    const marker = join(dir, 'launcher');
    await writeFile(join(dir, 'zellij'), '#!/bin/sh\nprintf "mux" > "$MARKER"\n');
    await writeFile(join(dir, 'code'), '#!/bin/sh\nprintf "ide" > "$MARKER"\n');
    await chmod(join(dir, 'zellij'), 0o755);
    await chmod(join(dir, 'code'), 0o755);
    const previousPath = process.env.PATH;
    const previousMarker = process.env.MARKER;
    process.env.PATH = `${dir}:${previousPath ?? ''}`;
    process.env.MARKER = marker;
    try {
      const result = await openFileAdjacent(join(dir, 'PLAN.md'), {
        cwd: dir,
        env: { ...process.env, MARKER: marker, TERM_PROGRAM: 'vscode', ZELLIJ: '1', EDITOR: '/bin/sh' },
      });
      expect(result.via).toBe('zellij');
      expect(await readFile(marker, 'utf8')).toBe('mux');
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousMarker === undefined) delete process.env.MARKER;
      else process.env.MARKER = previousMarker;
    }
  });

  it('prefers a valid EDITOR over VISUAL', async () => {
    expect(await resolveEditor({ EDITOR: '/bin/sh', VISUAL: '/bin/false' })).toBe('/bin/sh');
  });

  it('keeps editor paths with spaces as one argv entry', () => {
    expect(persistentEditorArgs('/tmp/editor with spaces', '/tmp/file with spaces', '/tmp/repo', '/bin/zsh')).toEqual([
      'bash',
      '-lc',
      'cd -- "$1" && shift && "$@"; exec "$0" -i',
      '/bin/zsh',
      '/tmp/repo',
      '/tmp/editor with spaces',
      '/tmp/file with spaces',
    ]);
  });

  it('keeps the interactive shell in the persistent argv', () => {
    const args = persistentEditorArgs('hx', 'notes.md', '/work/repo', '/bin/bash');
    expect(args[0]).toBe('bash');
    expect(args.slice(3)).toEqual(['/bin/bash', '/work/repo', 'hx', 'notes.md']);
  });

  it('runs the editor then leaves a shell with paths containing spaces', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diffpi editor '));
    const editor = join(dir, 'my editor');
    const shell = join(dir, 'my shell');
    const marker = join(dir, 'marker');
    const file = join(dir, 'my plan.md');
    await writeFile(editor, '#!/bin/sh\nprintf "%s|%s" "$PWD" "$1" > "$MARKER"\n');
    await writeFile(shell, '#!/bin/sh\nprintf "|shell:%s" "$1" >> "$MARKER"\n');
    await chmod(editor, 0o755);
    await chmod(shell, 0o755);
    const [runner, ...args] = persistentEditorArgs(editor, file, dir, shell);
    const child = spawnSync(runner!, args, { env: { ...process.env, MARKER: marker } });
    expect(child.status).toBe(0);
    expect(await readFile(marker, 'utf8')).toBe(`${dir}|${file}|shell:-i`);
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
