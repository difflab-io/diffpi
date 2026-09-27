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
    expect([...new Set(skill.match(/\bplan_[a-z_]+\b/g) ?? [])]).toEqual(['plan_verify']);
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
    expect(go).toContain(
      'Write `READY` and dispatch Workers ONLY after a current mechanical PASS and a completed attested reviewer PASS',
    );
    expect(go).toContain('If already `READY`, reread and verify current files as-is');
    expect(go).toContain('Run `plan_verify` on that exact plan directory');
    expect(go).toContain('A `steered`, partial, stopped, missing, or failed result is NOT a pass');
    for (const retiredTool of ['plan_start_execution', 'plan_update_status', 'plan_run_gates', 'plan_record_ci']) {
      expect(go).not.toContain(retiredTool);
    }
    expect([...new Set(go.match(/\bplan_[a-z_]+\b/g) ?? [])]).toEqual(['plan_verify']);
  });

  it('parses the plan reviewer contract as a read-only frontier/high reviewer', async () => {
    const source = await readFile(join(skillRoot, '..', 'agents', 'diffpi-plan-reviewer.md'), 'utf8');
    const [, frontmatter, prompt] = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
    const field = (name: string) => frontmatter.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1];
    expect(field('name')).toBe('diffpi-plan-reviewer');
    expect(field('model')).toBe('openai-codex/gpt-5.6-sol');
    expect(field('thinking')).toBe('high');
    expect(field('required_tools')).toContain('diffpi_modes_status');
    expect(field('tools')).toContain('read');
    expect(field('tools')).toContain('grep');
    expect(field('tools')).toContain('find');
    expect(field('tools')).toContain('ext:extensions/diffpi_modes_status');
    expect(field('extensions')).toBe('[extensions]');
    const planner = await readFile(join(skillRoot, '..', 'agents', 'diffpi-planner.md'), 'utf8');
    expect(planner).toContain('allowed_subagents: diffpi-plan-reviewer');
    expect(planner).toContain(
      'required_tools: read, grep, find, write, edit, Agent, get_subagent_result, diffpi_modes_status, plan_verify',
    );
    const orchestrator = await readFile(join(skillRoot, '..', 'agents', 'diffpi-orchestrator.md'), 'utf8');
    expect(orchestrator).toContain(
      'required_tools: read, write, edit, bash, Agent, watch_ci, diffpi_modes_status, plan_verify',
    );
    expect(field('tools')).not.toContain('plan_verify');
    for (const forbidden of ['write', 'edit', 'Agent', 'get_subagent_result', 'diffpi_modes_set']) {
      expect(field('forbidden_tools')).toContain(forbidden);
    }
    for (const requirement of [
      'whole-plan',
      'Action-labeled trees',
      'suffix labels are invalid',
      'Worker executability',
      'first step',
      'read-only',
    ]) {
      expect(prompt.toLowerCase()).toContain(requirement.toLowerCase());
    }
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
    const publish = await review('references/workflows/publish.md');
    const context = await review('references/workflows/status.md');
    expect(merge).toContain('review_merge');
    expect(merge).toContain('GitHub-only');
    expect(context).toContain('review_context');
    expect(publish).toContain('review_publish');
    expect(publish).not.toContain('review_merge');
    expect(merge).not.toContain('review_publish');
  });
});
