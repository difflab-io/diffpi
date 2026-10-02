/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../../src/extensions/processx';
import { diffpiLogTool } from '../../src/tools/log';

describe('diffpi_log', () => {
  it('writes the simple message schema to logs.jsonl beside PLAN.md', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-log-tool-'));
    const cwd = join(root, 'repo');
    await run('mkdir', ['-p', cwd]);
    await run('git', ['-C', cwd, 'init', '-q']);
    await diffpiLogTool.execute(
      'log',
      {
        cwd,
        filename: '.diffpi/plan/example/logs.jsonl',
        label: 'progress',
        message: 'Step complete.',
      },
      undefined,
      undefined,
      {} as never,
    );
    const planDir = join(cwd, '.diffpi', 'plan', 'example');
    const source = await readFile(join(planDir, 'logs.jsonl'), 'utf8');
    expect(source).toBe('{"message":"Step complete.","label":"progress"}\n');
    await expect(lstat(join(planDir, 'logs'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects unsafe filenames through the tool contract', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-log-tool-'));
    await expect(
      diffpiLogTool.execute(
        'log',
        {
          cwd: root,
          filename: '../escape.jsonl',
          message: 'nope',
        },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow();
  });
});
