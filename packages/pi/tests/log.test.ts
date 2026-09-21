/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendLogEntry, readLogEntries } from '../src/log';

describe('Diffpi activity log', () => {
  it('appends reusable progress, issue, and deviation records', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'diffpi-log-')), 'flow.jsonl');
    await appendLogEntry(path, {
      kind: 'deviation',
      actor: 'worker',
      message: 'Used the fallback API.',
      correlation: { workflow: 'flow', unitId: 'step-2' },
      evidence: ['Primary API unavailable.'],
    });
    const entries = await readLogEntries(path);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'deviation', correlation: { workflow: 'flow', unitId: 'step-2' } });
  });

  it('reports malformed JSONL with its line number', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'diffpi-log-')), 'bad.jsonl');
    await writeFile(path, '{}\nnot-json\n', 'utf8');
    await expect(readLogEntries(path)).rejects.toThrow('line 2');
  });
});
