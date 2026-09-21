/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createForge } from '../../src/vcs';
import { gitlabVcs, withFakeCommand } from '../fixtures/forge';

describe('GitLabVcsBackend', () => {
  it('queries checks for the requested merge request', async () => {
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-glab-checks-')), 'args.json');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'glab',
        `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.FAKE_LOG, JSON.stringify(Bun.argv.slice(2)));
process.stdout.write('success');`,
        async () => {
          expect((await createForge(gitlabVcs).prChecks(42)).status).toBe('passed');
        },
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    expect(JSON.parse(await readFile(log, 'utf8'))).toContain(
      'projects/difflab-io%2Fdiffpi/merge_requests/42/pipelines?per_page=1',
    );
  });

  it('watches the current branch only when it points to the exact commit', async () => {
    const sha = 'c'.repeat(40);
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-glab-ci-')), 'calls.log');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'glab',
        `import { appendFileSync } from 'node:fs';
const args = Bun.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'api') process.stdout.write('${sha}\\n');`,
        async () => {
          const result = await createForge(gitlabVcs).watchCommitCi(sha, { intervalSeconds: 5 });
          expect(result.status).toBe('passed');
        },
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[]);
    expect(calls.filter((call) => call[0] === 'api')).toHaveLength(2);
    expect(calls).toContainEqual([
      'ci',
      'status',
      '--repo',
      'difflab-io/diffpi',
      '--branch',
      'feature/review',
      '--live',
      '--compact',
    ]);
  });

  it('rejects monitoring when the GitLab branch head differs from the requested commit', async () => {
    await withFakeCommand('glab', `process.stdout.write('${'d'.repeat(40)}\\n');`, async () => {
      expect(createForge(gitlabVcs).watchCommitCi('e'.repeat(40), { intervalSeconds: 5 })).rejects.toThrow('not');
    });
  });
});
