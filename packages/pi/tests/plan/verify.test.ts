/// <reference types="bun" />

import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyLivePlan } from '../../src/plan/verify';
import { planVerifyTool } from '../../src/tools/plan';

const roots: string[] = [];
const plan = `# Build a verifier

- **Plan ID:** 260927-verifier
- **Status:** DRAFT

## Intent

Verify files directly.

## Requirements

- Report errors without mutation.

## Design

### Big Ideas

Read current files.

## Phases

### Phase 1: Build verifier

- [ ] **implement:** Add verifier

## References

- Live files.
`;
const brief = `# Phase 1: Build verifier

## Objective

Check structure.

## Files Affected

\`\`\`text
Phase 1/
└── [ADD] src/plan/verify.ts
\`\`\`

## Tasks

### 1. Add verifier

- **Task ID:** implement

## Implementation Constraints

Keep parsing read-only.
`;

async function fixture(planSource = plan, briefSource: string | null = brief): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'diffpi-live-plan-'));
  roots.push(root);
  const dir = join(root, '.diffpi', 'plan', '260927-verifier');
  await mkdir(join(dir, 'implementation'), { recursive: true });
  await writeFile(join(dir, 'PLAN.md'), planSource);
  if (briefSource !== null) await writeFile(join(dir, 'implementation', 'phase-1.md'), briefSource);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('plan_verify', () => {
  it('checks live file layout without mutating files or granting reviewer approval', async () => {
    const dir = await fixture();
    const before = await readFile(join(dir, 'PLAN.md'), 'utf8');
    const result = await verifyLivePlan(dir);
    expect(result).toMatchObject({ ok: true, issues: [], briefPaths: [join(dir, 'implementation', 'phase-1.md')] });
    expect(await readFile(join(dir, 'PLAN.md'), 'utf8')).toBe(before);
    const response = await planVerifyTool.execute('test', { plan: dir }, undefined, undefined, {} as never);
    expect(response.content[0]).toMatchObject({
      text: expect.stringContaining('Semantic Plan Reviewer approval is still required'),
    });
  });

  it('leaves tree correctness and task content to the independent reviewer', async () => {
    const dir = await fixture(
      plan.replace('**Status:** DRAFT', '**Status:** INCOMPLETE'),
      brief.replace('```text\nPhase 1/\n└── [ADD] src/plan/verify.ts\n```', '- [ADD] src/plan/verify.ts'),
    );
    expect((await verifyLivePlan(dir)).ok).toBe(true);
  });

  it('rejects files outside the flat plan directory or extra files inside it', async () => {
    const dir = await fixture();
    const misplaced = await verifyLivePlan(join(dir, 'implementation', 'phase-1.md'));
    expect(misplaced.issues.map(({ code }) => code)).toContain('path');
    const nested = join(dir, 'nested');
    await mkdir(nested);
    await writeFile(join(nested, 'PLAN.md'), plan);
    expect((await verifyLivePlan(nested)).issues.map(({ code }) => code)).toContain('layout');
    await writeFile(join(dir, 'notes.md'), 'unrelated');
    expect((await verifyLivePlan(dir)).issues.map(({ code }) => code)).toContain('layout');
  });

  it('accepts logs.jsonl beside PLAN.md and preserves historical logs directories', async () => {
    const dir = await fixture();
    await mkdir(join(dir, 'revisions'));
    await writeFile(join(dir, 'logs.jsonl'), '{"message":"Started."}\n');
    expect((await verifyLivePlan(dir)).issues.map(({ code }) => code)).not.toContain('layout');
    await mkdir(join(dir, 'logs'));
    expect((await verifyLivePlan(dir)).issues.map(({ code }) => code)).not.toContain('layout');
  });

  it('rejects wrong types and symlinks at colocated revisions and log paths', async () => {
    const fileDir = await fixture();
    await writeFile(join(fileDir, 'revisions'), 'not a directory');
    await writeFile(join(fileDir, 'logs'), 'not a directory');
    await mkdir(join(fileDir, 'logs.jsonl'));
    expect((await verifyLivePlan(fileDir)).issues.filter(({ code }) => code === 'layout')).toHaveLength(3);

    const symlinkDir = await fixture();
    await symlink(join(symlinkDir, 'implementation'), join(symlinkDir, 'revisions'));
    await symlink(join(symlinkDir, 'implementation'), join(symlinkDir, 'logs'));
    await symlink(join(symlinkDir, 'PLAN.md'), join(symlinkDir, 'logs.jsonl'));
    expect((await verifyLivePlan(symlinkDir)).issues.filter(({ code }) => code === 'layout')).toHaveLength(3);
  });

  it('reports missing and unexpected numbered briefs', async () => {
    const dir = await fixture(plan, null);
    const result = await verifyLivePlan(dir);
    expect(result.issues).toContainEqual({
      file: join(dir, 'implementation', 'phase-1.md'),
      line: 0,
      code: 'missing-brief',
      message: 'Numbered phase brief is not readable.',
    });
    await writeFile(join(dir, 'implementation', 'phase-2.md'), brief);
    expect((await verifyLivePlan(dir)).issues.map(({ code }) => code)).toContain('extra-brief');
  });

  it('requires the overview and brief headings exactly once and in order', async () => {
    const dir = await fixture(
      plan.replace('## Requirements', '## Out of order\n\n## Requirements'),
      brief.replace('## Files Affected', '## Tasks\n\n## Files Affected'),
    );
    expect((await verifyLivePlan(dir)).issues.filter(({ code }) => code === 'headings')).toHaveLength(2);
  });

  it('ignores headings inside fenced code and checks phase heading ordinals', async () => {
    const dir = await fixture(
      plan.replace('### Phase 1: Build verifier', '### Phase 2: Build verifier'),
      brief
        .replace('## Tasks', '```markdown\n## Extra\n```\n\n## Tasks')
        .replace('# Phase 1: Build verifier', '# Phase 2: Build verifier'),
    );
    const codes = (await verifyLivePlan(dir)).issues.map(({ code }) => code);
    expect(codes).toContain('phase-order');
    expect(codes).toContain('phase-title');
    expect(codes).not.toContain('headings');
  });
});
