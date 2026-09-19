/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChecked } from '../../src/extensions/processx';
import { createReviewTools } from '../../src/tools/review';

describe('review tools', () => {
  it('reports an unsupported remote instead of silently selecting local review', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'diffpi-unsupported-forge-'));
    await runChecked('git', ['-C', repo, 'init', '-q']);
    await runChecked('git', ['-C', repo, 'remote', 'add', 'origin', 'https://code.example.com/group/project.git']);
    const tool = createReviewTools().find((candidate) => candidate.name === 'review_diff');
    const response = await tool?.execute('review-diff', { cwd: repo }, undefined, undefined, {} as never);
    expect(response?.content[0]).toMatchObject({
      type: 'text',
      text: 'No supported GitHub or GitLab remote was detected. Use local=true for an offline tuicr review.',
    });
  });
});
