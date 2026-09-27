/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChecked } from '../../src/extensions/processx';
import { createReviewTools } from '../../src/tools/review';

describe('review tools', () => {
  it('reports worktree and review status without a forge or tuicr', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'diffpi-review-status-'));
    await runChecked('git', ['-C', repo, 'init', '-q']);
    await writeFile(join(repo, 'untracked.txt'), 'change\n');
    const tool = createReviewTools().find((candidate) => candidate.name === 'review_status');
    const response = await tool?.execute('review-status', { cwd: repo }, undefined, undefined, {} as never);
    const text = response?.content[0]?.type === 'text' ? response.content[0].text : '';
    expect(text).toContain('Worktree: dirty (staged=0, unstaged=0, untracked=1)');
    expect(text).toContain('Remote PR/MR: no');
    expect(text).toContain('Local working-tree tuicr review: no');
  });

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
