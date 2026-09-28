/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTemplate, renderTemplate, templateRelativePath } from '../src/templates';

describe('template registry', () => {
  it('supports incremental live-file authoring without requiring revisions or locks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-live-plan-'));
    const planPath = join(root, 'PLAN.md');
    const briefPath = join(root, 'implementation', 'phase-1.md');
    const planTemplate = await loadTemplate('plan/PLAN', { homeDir: root });
    const briefTemplate = await loadTemplate('plan/implementation', { homeDir: root });
    const renderPlan = () =>
      renderTemplate(planTemplate.content, {
        title: 'Live plan',
        id: 'demo',
        branch: 'feature/demo',
        issue_id: 'none',
        issue_url: 'none',
        intent: 'Ship a testable live plan.',
      })
        .replace('### Phase 1: <!-- phase title -->', '### Phase 1: Quality tests')
        .replace('<!-- assign a stable phase ID -->', 'phase-one')
        .replace('<!-- list phase IDs, or “None” -->', 'None')
        .replace('<!-- state the outcome -->', 'Prove the workflow.');

    await writeFile(planPath, renderPlan(), 'utf8');
    const overview = await readFile(planPath, 'utf8');
    expect(overview).toContain('**Status:** draft');
    expect(overview).toContain('### Phase 1: Quality tests');
    expect(overview).toContain('**Prerequisites:** None');
    expect(overview).toMatch(/- \[ \].*Task title/);
    expect(overview).not.toContain('**Dependencies:**');
    expect(await readdir(root)).toEqual(['PLAN.md']);
    await expect(readFile(briefPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

    const incomplete = renderTemplate(briefTemplate.content, {
      phase_ordinal: '1',
      phase_title: 'Quality tests',
      phase_id: 'phase-one',
      phase_prerequisites: 'None',
      phase_objective: 'Prove the workflow.',
      phase_tasks: '',
      phase_libraries: 'Bun',
      phase_constraints: 'Keep files readable.',
      phase_file_tree: '',
    });
    await mkdir(join(root, 'implementation'), { recursive: true });
    await writeFile(briefPath, incomplete, 'utf8');
    expect(await readFile(briefPath, 'utf8')).toContain('Task ID');
    expect((await readdir(root)).sort()).toEqual(['PLAN.md', 'implementation']);

    const complete = incomplete
      .replace('### 1. <!-- task title -->', '### 1. Write tests')
      .replace('<!-- stable task ID -->', 'quality-tests')
      .replace('<!-- ordered implementation action -->', 'Write the test')
      .replace('<!-- ordered implementation action -->', 'Run verification')
      .replace('<!-- command or inspection that proves this task -->', 'Run bun test')
      .replace('<!-- observable result -->', 'The live files remain readable.')
      .replace('<!-- exact/path/to/implementation-file -->', 'packages/pi/tests/templates.test.ts')
      .replace('<!-- exact/path/to/test-or-check -->', 'packages/pi/tests/plan/markdown.test.ts')
      .replace('<!-- Keep tasks flat and in phase order. Repeat this shape for each task. -->', '')
      .replace(
        '<!-- This is the only file scope for the phase; do not repeat file scopes inside tasks or PLAN.md. Include exactly one tree. Label every file leaf with [ADD], [MODIFY], [REMOVE], [MOVE from: path], or [VERIFY]. -->',
        '',
      );
    await writeFile(briefPath, complete, 'utf8');
    const finalBrief = await readFile(briefPath, 'utf8');
    expect(finalBrief).not.toContain('<!--');
    expect(finalBrief).not.toContain('**File scopes:**');
    expect(finalBrief).toMatch(
      /### 1\. Write tests[\s\S]*\*\*Steps:\*\*[\s\S]*1\. Write the test[\s\S]*\*\*Verify:\*\*[\s\S]*- Run bun test/,
    );
    const trees = [...finalBrief.matchAll(/## Phase File Tree[\s\S]*?```text\n([\s\S]*?)\n```/g)];
    expect(trees).toHaveLength(1);
    const leaves = trees[0]![1]!.split('\n').filter((line) => /[├└]──/.test(line));
    expect(leaves).toHaveLength(2);
    for (const leaf of leaves)
      expect(leaf).toMatch(/^[│\s]*[├└]── \[(?:ADD|MODIFY|REMOVE|MOVE from: [^\]]+|VERIFY)\] \S.+$/);
  });
  it('loads the bundled review template and renders variables', async () => {
    const template = await loadTemplate('review/draft-pr', {
      homeDir: join(await mkdtemp(join(tmpdir(), 'diffpi-home-')), 'home'),
    });
    expect(template.source).toBe('bundled');
    const rendered = renderTemplate(template.content, {
      intent: 'Ship reviews',
      issue_url: 'https://linear.app/example/issue/ENG-123',
      head: 'feature/review',
      base: 'main',
    });
    expect(rendered).toContain('Ship reviews');
    expect(rendered).toContain('## References');
    expect(rendered).toContain('https://linear.app/example/issue/ENG-123');
  });

  it('prefers a user override under the namespaced template directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-home-'));
    const path = join(home, '.difflab', 'diffpi', 'templates', 'review', 'draft-pr.md');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'Intent: {{intent}}\n', 'utf8');
    const template = await loadTemplate('review/draft-pr', { homeDir: home });
    expect(template.source).toBe('user');
    expect(renderTemplate(template.content, { intent: 'Override' })).toBe('Intent: Override\n');
  });

  it('rejects template paths outside the registry', () => {
    expect(() => templateRelativePath('../secret')).toThrow('Invalid template name');
  });
});
