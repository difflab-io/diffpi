/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
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
});
