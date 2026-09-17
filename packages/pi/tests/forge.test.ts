/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import {
  createForge,
  githubReviewSubmissionEndpoint,
  hasGitlabDraftNotes,
  isConfirmedMissingChange,
  parseGitlabDiffRefs,
} from '../src/forge';
import type { VcsInfo } from '../src/environment';

const githubVcs: VcsInfo = {
  provider: 'github',
  host: 'github.com',
  owner: 'difflab-io',
  repo: 'diffpi',
  branch: 'feature/review',
  root: '/tmp/diffpi',
};

const gitlabVcs: VcsInfo = {
  ...githubVcs,
  provider: 'gitlab',
  host: 'gitlab.com',
};

async function withFakeCommand<T>(name: string, source: string, callback: () => Promise<T>): Promise<T> {
  const bin = await mkdtemp(join(tmpdir(), 'diffpi-forge-bin-'));
  const executable = join(bin, name);
  await writeFile(executable, `#!${process.execPath}\n${source}\n`, 'utf8');
  await chmod(executable, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${previousPath ?? ''}`;
  try {
    return await callback();
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
}

describe('forge review helpers', () => {
  it('requires all GitLab diff refs for positioned draft notes', () => {
    expect(
      parseGitlabDiffRefs(JSON.stringify({ diff_refs: { base_sha: 'base', start_sha: 'start', head_sha: 'head' } })),
    ).toEqual({ base_sha: 'base', start_sha: 'start', head_sha: 'head' });
    expect(() => parseGitlabDiffRefs(JSON.stringify({ diff_refs: { head_sha: 'head' } }))).toThrow(
      'merge request diff refs are unavailable',
    );
  });

  it('detects whether GitLab has draft notes to publish', () => {
    expect(hasGitlabDraftNotes('[]')).toBe(false);
    expect(hasGitlabDraftNotes('[{"id":1}]')).toBe(true);
  });

  it('submits a GitHub review directly when no pending review exists', () => {
    expect(githubReviewSubmissionEndpoint('difflab', 'pi', 12, '')).toBe('/repos/difflab/pi/pulls/12/reviews');
    expect(githubReviewSubmissionEndpoint('difflab', 'pi', 12, '34')).toBe(
      '/repos/difflab/pi/pulls/12/reviews/34/events',
    );
  });

  it('recognizes only confirmed missing PR/MR errors', () => {
    expect(isConfirmedMissingChange('github', 'no pull requests found for branch "missing"')).toBe(true);
    expect(isConfirmedMissingChange('gitlab', 'failed to get open merge request: 404 Not Found')).toBe(true);
    expect(isConfirmedMissingChange('github', 'HTTP 401: Bad credentials')).toBe(false);
    expect(isConfirmedMissingChange('gitlab', 'invalid character in JSON')).toBe(false);
  });

  it('captures complete forge diffs larger than the bounded command buffer', async () => {
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

  it('resolves the forge default branch', async () => {
    await withFakeCommand('gh', `process.stdout.write('trunk\\n');`, async () => {
      expect(await createForge(githubVcs).defaultBranch()).toBe('trunk');
    });
  });

  it('creates a GitLab draft note for a review body without inline comments', async () => {
    const log = join(await mkdtemp(join(tmpdir(), 'diffpi-glab-log-')), 'calls.jsonl');
    const previousLog = process.env.FAKE_LOG;
    process.env.FAKE_LOG = log;
    try {
      await withFakeCommand(
        'glab',
        `import { appendFileSync } from 'node:fs';
const args = Bun.argv.slice(2);
const input = args.includes('--input') ? await Bun.stdin.text() : '';
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, input }) + '\\n');`,
        async () => {
          await createForge(gitlabVcs).createPendingReview(7, [], 'Overall blocking issue.');
        },
      );
    } finally {
      if (previousLog === undefined) delete process.env.FAKE_LOG;
      else process.env.FAKE_LOG = previousLog;
    }
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].input)).toEqual({ note: 'Overall blocking issue.' });
    expect(calls[0].args.some((arg: string) => arg.endsWith('/draft_notes'))).toBe(true);
  });

  it('fails explicitly before attempting an unsupported GitLab changes-request review', async () => {
    expect(createForge(gitlabVcs).submitReview(7, 'REQUEST_CHANGES', 'Please fix this.')).rejects.toThrow(
      'GitLab does not support REQUEST_CHANGES',
    );
  });
});
