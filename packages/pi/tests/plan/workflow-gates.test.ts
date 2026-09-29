/// <reference types="bun" />
import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planVerifyTool } from '../../src/tools/plan';

const roots: string[] = [];
const overview = `# Example plan

- **Plan ID:** 260928-example
- **Status:** DRAFT

## Intent

Implement a change.

## Requirements

- Preserve behavior.

## Design

### Big Ideas

Small change.

## Phases

### Phase 1: Change

- [ ] **change:** Change code

## References

- Reviewed snapshot: abc; completed verdict: BLOCKING; finding F1: unresolved.
`;
const brief = `# Phase 1: Change

## Objective

Change code.

## Files Affected

\`\`\`text
Phase 1/
└── [MODIFY] src/code.ts
\`\`\`

## Tasks

### 1. Change code

- **Task ID:** change

## Implementation Constraints

Preserve behavior.
`;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'diffpi-workflow-gates-'));
  roots.push(root);
  const dir = join(root, '.diffpi', 'plan', '260928-example');
  await mkdir(join(dir, 'implementation'), { recursive: true });
  await writeFile(join(dir, 'PLAN.md'), overview);
  await writeFile(join(dir, 'implementation', 'phase-1.md'), brief);
  return dir;
}

async function verify(dir: string) {
  return planVerifyTool.execute('check', { plan: dir }, undefined, undefined, {} as never);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('executable plan verification boundary', () => {
  it('verifies current files after a repair without changing DRAFT or converting a BLOCKING verdict to PASS', async () => {
    const dir = await fixture();
    const path = join(dir, 'implementation', 'phase-1.md');
    await writeFile(path, brief.replace('## Tasks', '## Missing tasks'));
    expect((await verify(dir)).details).toMatchObject({ ok: false });
    await writeFile(path, brief);
    expect((await verify(dir)).details).toMatchObject({ ok: true });
    expect(await readFile(join(dir, 'PLAN.md'), 'utf8')).toBe(overview);
  });

  it('blocks structural failure on the live post-review snapshot, even if review metadata is present', async () => {
    const dir = await fixture();
    await rm(join(dir, 'implementation', 'phase-1.md'));
    const response = await verify(dir);
    expect(response.details).toMatchObject({ ok: false });
    expect(response.content[0]?.text).toContain('[missing-brief]');
    expect(await readFile(join(dir, 'PLAN.md'), 'utf8')).toBe(overview);
  });

  it('does not mistake structural PASS for a completed review or resolved blocker', async () => {
    const dir = await fixture();
    const response = await verify(dir);
    expect(response.details).toMatchObject({ ok: true });
    expect(response.content[0]?.text).toContain('Semantic Plan Reviewer approval is still required');
    expect(await readFile(join(dir, 'PLAN.md'), 'utf8')).toContain('finding F1: unresolved');
  });
});
