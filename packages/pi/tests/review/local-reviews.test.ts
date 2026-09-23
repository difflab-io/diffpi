/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureLocalReview, readLocalReview } from '../../src/review/local-reviews';
import { runChecked } from '../../src/extensions/processx';

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), 'diffpi-local-review-'));
  const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-local-review-home-'));
  await runChecked('git', ['init', cwd]);
  const sessionPath = join(cwd, 'tuicr-session.json');
  await writeFile(
    sessionPath,
    JSON.stringify({
      branch_name: 'fix/review',
      repo_path: cwd,
      review_comments: [{ id: 'c1', content: 'Explain this change?' }],
      files: {
        'src/a.ts': {
          line_comments: { '4': [{ id: 'c2', content: 'Handle this case.', side: 'new' }] },
        },
      },
    }),
  );
  return { cwd, homeDir, sessionPath };
}

describe('local review dumps', () => {
  it('stores immutable flat revisions and removes completed tuicr sessions', async () => {
    const item = await fixture();
    const session = {
      slug: 'local/fix-review',
      kind: 'local',
      path: item.sessionPath,
      updatedAt: '2026-01-01T00:00:00.000Z',
      commentCount: 2,
      anchor: 'HEAD',
      active: false,
    };
    const first = await captureLocalReview({
      cwd: item.cwd,
      homeDir: item.homeDir,
      branch: 'fix/review',
      base: 'main',
      diff: 'diff --git a/src/a.ts b/src/a.ts',
      session,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(first.path).toEndWith('/review/fix-review/1.json');
    expect(first.dump.revision).toBe(1);
    expect(first.dump.comments.map((comment) => comment.id)).toEqual(['c1', 'c2']);
    expect(JSON.parse(await readFile(first.path, 'utf8'))).toEqual(first.dump);
    expect(await readLocalReview(item.cwd, 'fix/review', undefined, item.homeDir)).toEqual(first.dump);
    await expect(access(item.sessionPath)).rejects.toThrow();

    await writeFile(item.sessionPath, JSON.stringify({ branch_name: 'fix/review', repo_path: item.cwd }));
    const second = await captureLocalReview({
      cwd: item.cwd,
      homeDir: item.homeDir,
      branch: 'fix/review',
      base: 'main',
      diff: 'next diff',
      session,
    });
    expect(second.path).toEndWith('/review/fix-review/2.json');
    expect(second.dump.revision).toBe(2);
  });
});
