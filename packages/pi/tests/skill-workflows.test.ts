/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const skillRoot = join(import.meta.dir, '..', 'skills');
const plan = (path: string) => readFile(join(skillRoot, 'plan', path), 'utf8');
const review = (path: string) => readFile(join(skillRoot, 'review', path), 'utf8');
const reviewWorkflows = ['auto', 'new', 'open', 'status', 'edit', 'address', 'publish', 'complete', 'merge', 'help'];

describe('skill-owned plan and review workflows', () => {
  it('bundles every plan reference alongside its skill', async () => {
    const skill = await plan('SKILL.md');
    expect(skill).toContain('directly through successive normal read/write/edit calls');
    expect(skill).toContain('diffpi-plan-reviewer');
    expect(skill).toContain('Agent');
    for (const verb of ['init', 'new', 'update', 'annotate', 'finalize', 'go', 'help']) {
      expect(skill).toContain(`references/workflows/${verb}.md`);
      expect(await plan(`references/workflows/${verb}.md`)).toContain('# ');
    }
  });

  it('requires exactly one complete new revision without an editor and detailed update briefs', async () => {
    const created = await plan('references/workflows/new.md');
    const updated = await plan('references/workflows/update.md');
    const go = await plan('references/workflows/go.md');
    expect(created).toContain('Write the plan directory directly with normal `write`/`edit` calls');
    expect(created).toContain('Invoke exactly one `diffpi-plan-reviewer`');
    expect(created).toContain('thinking is high');
    expect(created).toContain('tools are read/search-only');
    expect(updated).toContain('Apply the update through successive direct `write`/`edit` calls');
    expect(updated).toContain('Invoke exactly one `diffpi-plan-reviewer`');
    expect(updated).toContain('thinking is high');
    expect(updated).toContain('capabilities are read/search-only');
    expect(go).toContain('finalize it inline before execution');
    expect(go).toContain('plan_update_status` for the plan from `draft` to `ready`');
    expect(go).toContain('ready` or `blocked` plan needs no review or readiness transition');
  });

  it('exposes background delegation tools and retains the local review selector', async () => {
    const skill = await review('SKILL.md');
    expect(skill).toContain('allowed-tools: read ask_user_question Agent');
    expect(skill).toContain('`--local` selects');
    expect(skill).toContain('must be preserved');
    expect(skill).toContain('`--bg`');
    for (const verb of reviewWorkflows) {
      expect(skill).toContain(`references/workflows/${verb}.md`);
      expect(await review(`references/workflows/${verb}.md`)).toContain('# ');
    }
    expect(await review('references/workflows/open.md')).toContain('system browser');
    expect(await review('references/workflows/status.md')).toContain('review_status');
    const merge = await review('references/workflows/merge.md');
    expect(merge).toContain('Do not query the forge through MCP');
    expect(merge).toContain('uses the GitHub CLI');
  });
});
