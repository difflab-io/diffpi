/// <reference types="bun" />
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChecked } from '../../src/extensions/processx';
import { assertGitHubMergeReady } from '../../src/vcs/github';
import { watchCiTool } from '../../src/tools/ci';
import { createReviewTools } from '../../src/tools/review';

const roots: string[] = [];
const tools = new Map(createReviewTools().map((tool) => [tool.name, tool]));
async function repo() {
  const cwd = await mkdtemp(join(tmpdir(), 'diffpi-review-gates-'));
  roots.push(cwd);
  await runChecked('git', ['-C', cwd, 'init', '-q']);
  return cwd;
}
async function execute(name: string, input: object) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`Missing review tool ${name}`);
  return tool.execute('test', input, undefined, undefined, {} as never);
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('review and CI tool gates', () => {
  it('blocks GitHub merge on denied readiness and failed hosted checks', () => {
    const pr = {
      state: 'OPEN',
      isDraft: false,
      reviewDecision: 'CHANGES_REQUESTED',
      mergeStateStatus: 'BLOCKED',
      statusCheckRollup: [{ __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'FAILURE' }],
    };
    expect(() => assertGitHubMergeReady(JSON.stringify(pr))).toThrow(/merge state is BLOCKED; build concluded failure/);
    expect(() => assertGitHubMergeReady(JSON.stringify({ ...pr, mergeStateStatus: 'CLEAN' }))).toThrow(
      /build concluded failure/,
    );
  });

  it('does not merge an unsupported local target or publish without a remote PR', async () => {
    const cwd = await repo();
    const merge = await execute('review_merge', { cwd });
    expect(merge.content[0]?.text).toContain('supports GitHub only');
    const publish = await execute('review_publish', { cwd, status: 'APPROVE' });
    expect(publish.content[0]?.text).toBe('No remote PR/MR to publish.');
    const complete = await execute('review_complete', { cwd, action: 'approve' });
    expect(complete.content[0]?.text).toBe('No remote PR/MR to complete.');
  });

  it('rejects invalid CI identity and distinguishes unavailable CI from a passing check', async () => {
    const cwd = await repo();
    await expect(
      watchCiTool.execute('ci', { cwd, sha: 'abc1234' }, undefined, undefined, {} as never),
    ).rejects.toThrow();
    const response = await watchCiTool.execute('ci', { cwd, sha: 'a'.repeat(40) }, undefined, undefined, {} as never);
    expect(response.details).toMatchObject({ status: 'skipped' });
    expect(response.content[0]?.text).toContain('CI skipped');
  });
});
