/// <reference types="bun" />

import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyLivePlan } from '../../src/plan/verify';
import { planVerifyTool } from '../../src/tools/plan';

const roots: string[] = [];
const plan = `# Build a verifier

- **Plan ID:** 260927-verifier
- **Branch:** feature/verifier
- **Status:** DRAFT

## Intent

Verify files directly.

## Requirements

- Report mechanical errors without mutation.

## Design

### Big Ideas

Use the current files.

### Key API Addition/Updates

Add plan_verify.

### Consequences

No stored state.

## Phases

### Phase 1: Build verifier

- **Phase ID:** build-verifier
- **Prerequisites:** None
- **Objective:** Check files.

- [ ] **implement:** Add verifier

## References

- Live files.
`;
const brief = `# Phase 1: Build verifier

- **Phase ID:** build-verifier
- **Prerequisites:** None

## Objective

Check structure.

## Tasks

### 1. Add verifier

- **Task ID:** implement
- **Steps:**
  1. Read the source files.
     - **Verify:** Check the result has no issues.
- **File scopes:** \`src/plan/verify.ts\`
- **Acceptance:** Existing files remain unchanged.

## Implementation Constraints

### Libraries and Algorithms

None.

### Constraints

No writes.

## Phase File Tree

\`\`\`text
Phase 1/
└── [ADD] src/plan/verify.ts
\`\`\`
`;

async function fixture(planSource = plan, briefSource: string | null = brief): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'diffpi-live-plan-'));
  roots.push(root);
  await writeFile(join(root, 'PLAN.md'), planSource);
  await mkdir(join(root, 'implementation'));
  if (briefSource !== null) await writeFile(join(root, 'implementation', 'phase-1.md'), briefSource);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('plan_verify', () => {
  it('passes a complete live plan without changing its files', async () => {
    const root = await fixture();
    const before = await readFile(join(root, 'PLAN.md'), 'utf8');
    const result = await verifyLivePlan(root);
    expect(result.ok).toBe(true);
    expect(result.briefPaths).toEqual([join(root, 'implementation', 'phase-1.md')]);
    expect(result.issues).toEqual([]);
    expect(await readFile(join(root, 'PLAN.md'), 'utf8')).toBe(before);
    const response = await planVerifyTool.execute('test', { plan: root }, undefined, undefined, {} as never);
    expect(response.details).toMatchObject({ ok: true });
    expect(response.content[0]).toMatchObject({
      text: expect.stringContaining('Semantic Plan Reviewer approval is still required'),
    });
  });

  it('accepts flat bold IDs and task-level nested verification', async () => {
    const root = await fixture(
      plan.replace('**implement:** Add verifier', '**implement** Add verifier'),
      brief.replace(
        '     - **Verify:** Check the result has no issues.',
        '- **Verify:**\n  - Check the result has no issues.',
      ),
    );
    expect((await verifyLivePlan(root)).ok).toBe(true);
  });

  it('reports visible incomplete drafts instead of mutating or hiding them', async () => {
    const root = await fixture(plan, null);
    const result = await verifyLivePlan(join(root, 'PLAN.md'));
    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual({
      file: join(root, 'implementation', 'phase-1.md'),
      line: 0,
      code: 'missing-brief',
      message: 'Numbered phase brief is not readable.',
    });
    expect(await readFile(join(root, 'PLAN.md'), 'utf8')).toBe(plan);
  });

  it('catches task parity, nested checkboxes, missing constraints, and suffix tree labels', async () => {
    const root = await fixture(
      plan.replace('- [ ] **implement:** Add verifier', '  - [ ] **implement:** Add verifier'),
      brief
        .replace('### 1. Add verifier', '### 1. Different title')
        .replace('### Libraries and Algorithms', '### Missing Libraries')
        .replace('└── [ADD] src/plan/verify.ts', '└── src/plan/verify.ts [ADD]'),
    );
    const result = await verifyLivePlan(root);
    expect(result.ok).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['task-format', 'section', 'task-parity', 'tree-label']),
    );
    expect(result.issues.find(({ code }) => code === 'tree-label')?.line).toBeGreaterThan(0);
  });

  it('rejects an empty verification instruction and an unknown status', async () => {
    const root = await fixture(
      plan.replace('**Status:** DRAFT', '**Status:** INCOMPLETE'),
      brief.replace('     - **Verify:** Check the result has no issues.', '- **Verify:**'),
    );
    const result = await verifyLivePlan(root);
    expect(result.ok).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(['status', 'verification']));
  });

  it('rejects missing phase prerequisites and unexpected numbered briefs', async () => {
    const root = await fixture(plan.replace('**Prerequisites:** None', '**Prerequisites:** missing-phase'));
    await writeFile(join(root, 'implementation', 'phase-2.md'), brief);
    const result = await verifyLivePlan(root);
    expect(result.ok).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(['prerequisites', 'extra-brief']));
  });
});
