/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from '../../src/extensions/processx';
import { diffpiLogTool } from '../../src/tools/log';

describe('diffpi_log', () => {
  it('writes a project-scoped reusable channel', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-log-tool-'));
    const cwd = join(root, 'repo');
    await run('mkdir', ['-p', cwd]);
    await run('git', ['-C', cwd, 'init', '-q']);
    await diffpiLogTool.execute(
      'log',
      {
        cwd,
        channel: 'flow',
        kind: 'progress',
        actor: 'worker',
        message: 'Step complete.',
      },
      undefined,
      undefined,
      {} as never,
    );
    const source = await readFile(join(cwd, '.diffpi', 'logs', 'flow.jsonl'), 'utf8');
    expect(JSON.parse(source)).toMatchObject({ kind: 'progress', actor: 'worker', message: 'Step complete.' });
  });
});
