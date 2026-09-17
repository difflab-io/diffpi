/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/process';
import { findMatchingSession, toFindings, type SessionSummary } from '../src/tuicr';

describe('tuicr toFindings', () => {
  it('maps line, file, and review comments to the forge shape', () => {
    const session = {
      branch_name: 'feature/review',
      review_comments: [{ content: 'Overall: looks good.' }],
      files: {
        'src/foo.ts': {
          file_comments: [{ content: 'Remove this file.', side: null }],
          line_comments: {
            '42': [{ content: 'Validate this input.', side: 'new' as const }],
            '7': [{ content: 'This was here before.', side: 'old' as const }],
          },
        },
      },
    };
    const { comments, body } = toFindings(session);
    expect(body).toBe('Overall: looks good.\n\nFile: src/foo.ts\n\nRemove this file.');
    expect(comments).toEqual(
      expect.arrayContaining([
        { file: 'src/foo.ts', line: 42, side: 'RIGHT', body: 'Validate this input.' },
        { file: 'src/foo.ts', line: 7, side: 'LEFT', body: 'This was here before.' },
      ]),
    );
    expect(comments).not.toContainEqual({ file: 'src/foo.ts', line: 1, side: 'RIGHT', body: 'Remove this file.' });
  });

  it('returns empty results for an empty session', () => {
    expect(toFindings({})).toEqual({ comments: [], body: '' });
  });

  it('selects only a session whose repository and branch both match', async () => {
    const base = await mkdtemp(join(tmpdir(), 'diffpi-tuicr-'));
    const repo = join(base, 'repo');
    const otherRepo = join(base, 'other');
    await mkdir(repo);
    await mkdir(otherRepo);
    await run('git', ['-C', repo, 'init', '-q']);
    const wrongBranchPath = join(base, 'wrong-branch.json');
    const wrongRepoPath = join(base, 'wrong-repo.json');
    const matchingPath = join(base, 'matching.json');
    await writeFile(wrongBranchPath, JSON.stringify({ repo_path: repo, branch_name: 'feature/other' }));
    await writeFile(wrongRepoPath, JSON.stringify({ repo_path: otherRepo, branch_name: 'feature/review' }));
    await writeFile(matchingPath, JSON.stringify({ repo_path: repo, branch_name: 'feature/review' }));
    const summary = (path: string, slug: string): SessionSummary => ({
      slug,
      kind: 'local',
      path,
      updatedAt: '',
      commentCount: 0,
      anchor: 'feature/review',
      active: false,
    });
    const sessions = [
      summary(wrongBranchPath, 'wrong-branch'),
      summary(wrongRepoPath, 'wrong-repo'),
      summary(matchingPath, 'matching'),
    ];

    expect((await findMatchingSession(sessions, repo, 'feature/review'))?.slug).toBe('matching');
    expect(await findMatchingSession(sessions.slice(0, 2), repo, 'feature/review')).toBeUndefined();
  });
});
