/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTemplate, renderTemplate, templateRelativePath } from '../src/templates';
import { assertRenderedReviewBody } from '../src/tools/review';

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
        .replace('<!-- state the outcome -->', 'Prove the workflow.')
        .replace('<!-- phase guardrails or None; do not repeat them in briefs -->', 'None');

    await writeFile(planPath, renderPlan(), 'utf8');
    const overview = await readFile(planPath, 'utf8');
    expect(overview).toContain('**Status:** draft');
    expect(overview).toContain('**Execution state:** inactive');
    expect(overview).toContain('**Execution worktree:** None');
    expect(overview).toContain('**Execution reason:** None');
    expect(overview.indexOf('**Execution state:**')).toBeGreaterThan(overview.indexOf('**Status:**'));
    expect(overview.indexOf('**Issue:**')).toBeGreaterThan(overview.indexOf('**Execution reason:**'));
    expect(overview).toContain('### Phase 1: Quality tests');
    expect(overview).toContain('**Prerequisites:** None');
    expect(overview).toContain('**Constraints:** None');
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
      phase_files_affected: '',
      phase_implementation_constraints: 'Use Bun for the fixture tests.',
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
        '<!-- This is the sole file scope for this phase. Use one fenced text tree; label each file leaf [ADD], [MODIFY], [REMOVE], [MOVE from: path], or [VERIFY]. Do not repeat file scopes in tasks or PLAN.md. -->',
        '',
      )
      .replace(
        '<!-- Free-form implementation details, not a restatement of PLAN.md phase constraints. Add only useful optional headings: Required Libraries & Technology Choices, Key Algorithm Specifications, Core Invariants. Refer to the PLAN.md phase ID instead of repeating a phase guardrail. -->',
        '',
      );
    await writeFile(briefPath, complete, 'utf8');
    const finalBrief = await readFile(briefPath, 'utf8');
    expect(finalBrief).not.toContain('<!--');
    expect(finalBrief).not.toContain('**File scopes:**');
    expect(finalBrief).toMatch(
      /### 1\. Write tests[\s\S]*\*\*Steps:\*\*[\s\S]*1\. Write the test[\s\S]*\*\*Verify:\*\*[\s\S]*- Run bun test/,
    );
    expect(finalBrief).not.toContain('## Phase File Tree');
    expect(finalBrief).not.toContain('### Constraints');
    const sections = [...finalBrief.matchAll(/^## (Objective|Files Affected|Tasks|Implementation Constraints)$/gm)].map(
      (match) => match[1],
    );
    expect(sections).toEqual(['Objective', 'Files Affected', 'Tasks', 'Implementation Constraints']);
    const affected = finalBrief.split('## Files Affected')[1]!.split('## Tasks')[0]!;
    const trees = [...affected.matchAll(/```text\n([\s\S]*?)\n```/g)];
    expect(trees).toHaveLength(1);
    expect(trees[0]![1]!.split('\n')[0]).toBe('Phase 1/');
    const leaves = trees[0]![1]!.split('\n').filter((line) => /[├└]──/.test(line));
    expect(leaves).toHaveLength(2);
    for (const leaf of leaves)
      expect(leaf).toMatch(/^[│\s]*[├└]── \[(?:ADD|MODIFY|REMOVE|MOVE from: [^\]]+|VERIFY)\] \S.+$/);
    expect(affected).not.toMatch(/^- \[(?:ADD|MODIFY|REMOVE|VERIFY)\]/m);
    expect(finalBrief).toContain('Use Bun for the fixture tests.');
  });
  it('loads the packaged local review template with stable finding conventions', async () => {
    const path = join(import.meta.dir, '..', 'skills/review/templates/REVIEW.md');
    const content = await readFile(path, 'utf8');
    expect(content).toContain('# Local Review');
    expect(content).toContain('### F-001 [ ]');
    expect(content).toContain('## Replies');
    expect(content).toContain('## Verification');
  });

  it('loads the bundled review template and renders variables', async () => {
    const template = await loadTemplate('review/draft-pr', {
      homeDir: join(await mkdtemp(join(tmpdir(), 'diffpi-home-')), 'home'),
    });
    expect(template.source).toBe('bundled');
    const rendered = renderTemplate(template.content, {
      intent: 'Ship reviews',
      changes: 'Add a remote review workflow.',
      validation: 'Not run (draft).',
      issue_url: 'https://linear.app/example/issue/ENG-123',
      further_work: 'Not yet assessed.',
    });
    expect(rendered).toContain('Ship reviews');
    expect(rendered).toContain('Add a remote review workflow.');
    expect(rendered).toContain('https://linear.app/example/issue/ENG-123');
    expect(() => assertRenderedReviewBody(rendered)).not.toThrow();
    expect(() => assertRenderedReviewBody(template.content)).toThrow('unresolved template placeholders');
    expect(() => assertRenderedReviewBody(rendered.replace('Not run (draft).', '<!-- TODO -->'))).toThrow(
      'HTML comments',
    );
    expect(() => assertRenderedReviewBody(rendered.replace('Not run (draft).', ''))).toThrow(
      'filled Validation section',
    );
  });

  it('instructs remote draft workers to supply a filled template body', async () => {
    const workflow = await readFile(join(import.meta.dir, '../skills/review/references/workflows/new.md'), 'utf8');
    expect(workflow).toContain('Pass the fully rendered Markdown as `body` to the existing `review_new` tool');
    expect(workflow).toContain('Not run (draft)');
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
