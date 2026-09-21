/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createForge } from '../../src/vcs';
import { githubVcs, withFakeCommand } from '../fixtures/forge';

describe('GitHubVcsBackend', () => {
  it('captures complete diffs larger than the bounded command buffer', async () => {
    await withFakeCommand(
      'gh',
      `if (Bun.argv.slice(2, 4).join(' ') === 'pr diff') process.stdout.write('a'.repeat(100_000));`,
      async () => {
        const diff = await createForge(githubVcs).prDiff(3);
        expect(diff).toHaveLength(100_000);
        expect(diff.startsWith('aaaa')).toBe(true);
      },
    );
  });

  it('preserves operational and parse failures while returning undefined for a missing PR', async () => {
    await withFakeCommand(
      'gh',
      `const id = Bun.argv[4];
if (id === 'missing') { console.error('no pull requests found for branch "missing"'); process.exit(1); }
if (id === 'auth') { console.error('HTTP 401: Bad credentials'); process.exit(1); }
if (id === 'malformed') process.stdout.write('{');`,
      async () => {
        const forge = createForge(githubVcs);
        expect(await forge.viewPr('missing')).toBeUndefined();
        expect(forge.viewPr('auth')).rejects.toThrow('Bad credentials');
        expect(forge.viewPr('malformed')).rejects.toThrow('Cannot parse');
      },
    );
  });

  it('resolves the default branch', async () => {
    await withFakeCommand('gh', `process.stdout.write('trunk\\n');`, async () => {
      expect(await createForge(githubVcs).defaultBranch()).toBe('trunk');
    });
  });

  it('uses the native pull request check exit status without parsing check names', async () => {
    await withFakeCommand(
      'gh',
      `const id = Bun.argv[4];
if (id === '1') process.exit(0);
if (id === '2') process.exit(8);
if (id === '3') { console.error('no checks reported'); process.exit(1); }
console.error('failure-mode tests'); process.exit(1);`,
      async () => {
        const forge = createForge(githubVcs);
        expect((await forge.prChecks(1)).status).toBe('passed');
        expect((await forge.prChecks(2)).status).toBe('pending');
        expect((await forge.prChecks(3)).status).toBe('skipped');
        expect((await forge.prChecks(4)).status).toBe('failed');
      },
    );
  });

  it('selects GitHub Actions runs by exact commit and trusts native watch exits', async () => {
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-gh-ci-')), 'calls.log');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'gh',
        `import { appendFileSync } from 'node:fs';
const args = Bun.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'run' && args[1] === 'list') process.stdout.write('101\\n102\\n');
if (args[0] === 'run' && args[1] === 'watch' && args[2] === '102') process.exit(1);`,
        async () => {
          const result = await createForge(githubVcs).watchCommitCi('a'.repeat(40), { intervalSeconds: 7 });
          expect(result.status).toBe('failed');
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
    expect(calls[0]).toContain('a'.repeat(40));
    expect(calls.filter((call) => call[0] === 'run' && call[1] === 'watch')).toHaveLength(2);
  });

  it('skips exact-commit monitoring when GitHub reports no runs', async () => {
    await withFakeCommand('gh', '', async () => {
      expect((await createForge(githubVcs).watchCommitCi('b'.repeat(40), { intervalSeconds: 3 })).status).toBe(
        'skipped',
      );
    });
  });

  it('cancels the native watcher through the process boundary', async () => {
    await withFakeCommand(
      'gh',
      `const args = Bun.argv.slice(2);
if (args[0] === 'run' && args[1] === 'list') process.stdout.write('101\\n');
else await Bun.sleep(10_000);`,
      async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 20);
        expect(
          createForge(githubVcs).watchCommitCi('f'.repeat(40), {
            intervalSeconds: 3,
            signal: controller.signal,
          }),
        ).rejects.toThrow();
      },
    );
  });
});
