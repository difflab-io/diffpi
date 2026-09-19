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
process.stdout.write('[]');`,
        async () => {
          await createForge(gitlabVcs).prChecks(42);
        },
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    expect(JSON.parse(await readFile(log, 'utf8'))).toContain(
      'projects/difflab-io%2Fdiffpi/merge_requests/42/pipelines?per_page=100',
    );
  });
});
