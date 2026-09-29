/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { registerPlanCommand } from '../src/commands/plan';
import { registerReviewCommand } from '../src/commands/review';

const root = join(import.meta.dir, '..');
const skill = (name: string, path: string) => readFile(join(root, 'skills', name, path), 'utf8');
const agent = (name: string) => readFile(join(root, 'agents', `diffpi-${name}.md`), 'utf8');
const planVerbs = ['init', 'new', 'update', 'annotate', 'finalize', 'go', 'help'];
const reviewVerbs = ['auto', 'new', 'open', 'status', 'edit', 'address', 'publish', 'complete', 'merge', 'help'];

describe('plan/review alias dispatch boundary', () => {
  for (const [name, verbs, register] of [
    ['plan', planVerbs, registerPlanCommand],
    ['review', reviewVerbs, registerReviewCommand],
  ] as const) {
    it(`forwards every ${name} verb to the skill without doing substantive work in the command`, async () => {
      let handler: ((args: string) => Promise<void>) | undefined;
      const forwarded: unknown[][] = [];
      register({
        registerCommand(_name: string, command: { handler: (args: string) => Promise<void> }) {
          handler = command.handler;
        },
        sendUserMessage(...args: unknown[]) {
          forwarded.push(args);
        },
      } as never);
      expect(handler).toBeDefined();
      for (const verb of verbs) await handler?.(`${verb} --target example --local`);
      expect(forwarded).toEqual(
        verbs.map((verb) => [
          `/skill:${name} ${verb} --target example --local`,
          { deliverAs: 'followUp', expandPromptTemplates: true },
        ]),
      );
    });
  }
});

describe('background plan/review contracts', () => {
  it('exposes every workflow without narrowing skill or agent resources', async () => {
    const entries = await readdir(join(root, 'skills'), { withFileTypes: true });
    expect(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).not.toContain('mode');
    for (const name of ['plan', 'review']) {
      const source = await skill(name, 'SKILL.md');
      expect(source).not.toMatch(/^allowed-tools:/m);
      expect(source).toContain('background');
      expect(source).toContain('get_subagent_result');
      expect(source).toContain('Agent');
      for (const verb of name === 'plan' ? planVerbs : reviewVerbs) {
        expect(source).toContain(`references/workflows/${verb}.md`);
        expect(await skill(name, `references/workflows/${verb}.md`)).toContain('# ');
      }
    }
    for (const name of ['copilot', 'orchestrator', 'plan-reviewer', 'planner', 'reviewer', 'tutor', 'worker']) {
      const profile = await agent(name);
      expect(profile).toContain('allowed_subagents: all');
      expect(profile).not.toMatch(
        /^(?:tools|extensions|skills|required_tools|forbidden_tools|disallowed_tools|exclude_extensions):/m,
      );
    }
  });

  it('routes substantive verbs into attached background work and keeps simple exceptions explicit', async () => {
    const plan = await skill('plan', 'SKILL.md');
    const review = await skill('review', 'SKILL.md');
    for (const verb of ['init', 'new', 'update', 'finalize', 'go']) expect(plan).toContain(`\`${verb}\``);
    for (const verb of ['new', 'auto', 'address']) expect(review).toContain(`\`${verb}\``);
    expect(plan).toContain('background: true');
    expect(review).toContain('background: true');
    expect(plan).toContain('A shell process, detached Pi instance');
    expect(review).toContain('help, immediate `status`, `open`');
    expect(review).toContain('short explicitly approved lifecycle call');
    expect(review).toContain('If unavailable, name the missing capability');
  });

  it('requires one completed Plan Reviewer round, post-fix verification and an explicit READY transition', async () => {
    const newFlow = await skill('plan', 'references/workflows/new.md');
    const updateFlow = await skill('plan', 'references/workflows/update.md');
    const finalizeFlow = await skill('plan', 'references/workflows/finalize.md');
    const goFlow = await skill('plan', 'references/workflows/go.md');
    for (const source of [newFlow, updateFlow]) {
      expect(source).toMatch(/(?:exactly one|one whole-plan)/);
      expect(source).toContain('completed');
      expect(source).toContain('disposition');
      expect(source).toContain('plan_verify');
      expect(source).toContain('DRAFT');
      expect(source.toLowerCase()).toMatch(/(?:do \*\*not\*\*|do not|never automatically)/);
    }
    expect(finalizeFlow).toContain('unresolved BLOCKING');
    expect(finalizeFlow).toContain('post-fix structural PASS does not mean');
    expect(goFlow).toContain('Write READY before execution');
    expect(goFlow).toContain('exact SHA');
    expect(goFlow).toContain('one **completed** Plan Reviewer round');
    const reviewer = await agent('plan-reviewer');
    expect(reviewer).toContain('MUST NOT use any mutating tool');
    expect(reviewer).toContain('not a sandbox');
    expect(reviewer).toContain('BLOCKING');
    expect(reviewer).toContain('created only by later tasks');
    expect(newFlow).toContain('test file created only by a later task');
    expect(await skill('review', 'SKILL.md')).toContain('does not constrain code review');
  });
});
