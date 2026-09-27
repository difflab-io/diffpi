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
    expect(skill).toContain('direct files');
    expect(skill).toContain('diffpi-plan-reviewer');
    expect(skill).toContain('Agent');
    expect(skill).not.toMatch(/\bplan_[a-z_]+\b/);
    for (const verb of ['init', 'new', 'update', 'annotate', 'finalize', 'go', 'help']) {
      expect(skill).toContain(`references/workflows/${verb}.md`);
      expect(await plan(`references/workflows/${verb}.md`)).toContain('# ');
    }
  });

  it('requires exactly one complete new revision without an editor and detailed update briefs', async () => {
    const created = await plan('references/workflows/new.md');
    const updated = await plan('references/workflows/update.md');
    const go = await plan('references/workflows/go.md');
    expect(created).toContain('Successively write `PLAN.md`');
    expect(created).toContain('exactly one independent `diffpi-plan-reviewer`');
    expect(created).toContain('frontier/high');
    expect(created).toContain('read/search-only');
    expect(updated).toContain('successively edit/write authoritative live files');
    expect(updated).toContain('exactly one independent `diffpi-plan-reviewer`');
    expect(updated).toContain('frontier/high');
    expect(updated).toContain('read/search-only');
    expect(go).toContain('write `READY` before execution');
    expect(go).toContain('If `READY`, reread current files as-is');
    expect(go).not.toMatch(/\bplan_[a-z_]+\b/);
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
    expect(await review('references/workflows/open.md')).toContain('review_open');
    expect(await review('references/workflows/status.md')).toContain('review_status');
    const merge = await review('references/workflows/merge.md');
    expect(merge).toContain('review_merge');
    expect(merge).toContain('GitHub-only');
  });
});
