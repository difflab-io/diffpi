/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const skill = (name: string, path: string) => readFile(join(root, 'skills', name, path), 'utf8');
const agent = (name: string) => readFile(join(root, 'agents', `diffpi-${name}.md`), 'utf8');
const planVerbs = ['init', 'new', 'update', 'annotate', 'validate', 'finalize', 'go', 'help'];
const reviewVerbs = ['auto', 'new', 'open', 'status', 'edit', 'address', 'publish', 'complete', 'merge', 'help'];

describe('native plan/review skill routing', () => {
  for (const [name, verbs] of [
    ['plan', planVerbs],
    ['review', reviewVerbs],
  ] as const) {
    it(`leaves ${name} verb inference and missing-input help to the root skill`, async () => {
      const source = await skill(name, 'SKILL.md');
      for (const verb of verbs) {
        expect(source).toContain(`references/workflows/${verb}.md`);
        expect(await skill(name, `references/workflows/${verb}.md`)).toContain('# ');
      }
      expect(source).toContain('help');
      expect(source).toMatch(/(?:infer|fuzzy-match)/i);
      expect(source).not.toMatch(/^allowed-tools:/m);
    });
  }

  it('does not narrow the ambient agent or skill resources', async () => {
    const entries = await readdir(join(root, 'skills'), { withFileTypes: true });
    expect(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).not.toContain('mode');
    for (const name of ['copilot', 'orchestrator', 'plan-reviewer', 'planner', 'reviewer', 'tutor', 'worker']) {
      const profile = await agent(name);
      expect(profile).toContain(
        `name: ${['planner', 'orchestrator', 'plan-reviewer', 'reviewer', 'worker'].includes(name) ? `diffpi-${name}` : name}`,
      );
      expect(profile).toContain('allowed_subagents: all');
      expect(profile).not.toMatch(
        /^(?:tools|extensions|skills|required_tools|forbidden_tools|disallowed_tools|exclude_extensions):/m,
      );
    }
  });

  it('gives background children self-contained work rather than a recursive skill invocation', async () => {
    const flows = [
      ['plan', 'init'],
      ['plan', 'new'],
      ['plan', 'update'],
      ['plan', 'validate'],
      ['plan', 'finalize'],
      ['plan', 'go'],
      ['review', 'new'],
      ['review', 'auto'],
      ['review', 'address'],
      ['review', 'publish'],
      ['review', 'complete'],
      ['review', 'merge'],
    ] as const;
    for (const [name, verb] of flows) {
      const source = await skill(name, `references/workflows/${verb}.md`);
      expect(source).toContain('background');
      expect(source).toContain('diffpi-');
      expect(source).not.toMatch(
        /(?:ask|tell|instruct) (?:the )?child to (?:read|invoke) (?:the |this )?(?:same )?skill/i,
      );
    }
    const init = await skill('plan', 'references/workflows/init.md');
    expect(init).toContain('Exact request: {exact-request}');
    expect(init).toContain('Initiating Git root: {repo-root}');
    expect(init).toContain('Check collisions before writing');
  });

  it('assigns draft review to validation once per authoring cycle', async () => {
    const validate = await skill('plan', 'references/workflows/validate.md');
    const draft = await skill('plan', 'references/workflows/new.md');
    const update = await skill('plan', 'references/workflows/update.md');
    const finalize = await skill('plan', 'references/workflows/finalize.md');
    expect(validate).toContain('## Parse arguments');
    expect(validate).toContain('## Steps');
    expect(validate).toContain('at most ONE independent');
    expect(validate).toContain('reuse it');
    expect(validate).toContain('Git HEAD, porcelain status, diff and untracked inventory');
    expect(validate).toContain('rerun ONLY the read-only structural check');
    expect(draft).toContain('do not dispatch a reviewer');
    expect(draft).toContain('[validate](validate.md)');
    expect(update).toContain('inherit_context: true');
    expect(update).toContain('explicit **low** thinking');
    expect(update).toContain('requested edits');
    expect(update).toContain('[validate](validate.md)');
    expect(finalize).toContain('calling agent');
    expect(finalize).toContain('DRAFT → READY');
    expect(finalize).toContain('If validation is incomplete or blocked');
  });

  it('gates the no-native-subagent plan fallback on explicit caller confirmation', async () => {
    const rootSkill = await skill('plan', 'SKILL.md');
    const fallback = await skill('plan', 'references/workflows/inline-fallback.md');
    expect(rootSkill).toContain('references/workflows/inline-fallback.md');
    for (const verb of ['init', 'new', 'update', 'validate', 'finalize', 'go']) {
      const flow = await skill('plan', `references/workflows/${verb}.md`);
      expect(flow).toContain('[the inline exception](inline-fallback.md)');
      expect(flow).toContain('explicit confirmation');
    }
    expect(fallback).toContain('no native subagent mechanism is available');
    expect(fallback).toContain('ask_user_question');
    expect(fallback).toContain('reduced isolation/model-tier');
    expect(fallback).toContain('not independent');
    expect(fallback).toContain('stop and report the blocker to the initiating thread');
    expect(fallback).toContain('Noninteractive evals still require an actual completed child');
    expect(fallback).toContain('A failed reviewer, gate, implementation');
    expect(fallback).toContain('Do not silently fall back');
    expect(fallback).toContain('`update` must preserve completed work');
  });

  it('records inline plan reviewer provenance and permits READY only on verified approved exception', async () => {
    const fallback = await skill('plan', 'references/workflows/inline-fallback.md');
    expect(fallback).toContain('one distinct read-only inline Plan Reviewer checklist pass');
    expect(fallback).toContain('INLINE reviewer (same thread, not independent)');
    expect(fallback).toContain(
      'Never fabricate a child ID, completed subagent, independent verdict or independent PASS',
    );
    expect(fallback).toContain('Git HEAD, porcelain status, diff and untracked inventory');
    expect(fallback).toContain('per authoring cycle');
    expect(fallback).toContain('preserve an original BLOCKING verdict');
    expect(fallback).toContain('do not call repaired content reviewer-approved');
    expect(fallback).toContain(
      'passing inline structural verification and inline review/disposition validation under the recorded approved exception',
    );
    expect(fallback).toContain('DRAFT → READY');
    expect(fallback).toContain('same phase gates, no-commit/commit/push policy and exact-SHA CI requirements');
  });

  it('uses Diffpi-owned agent IDs rather than generic planner and reviewer profiles', async () => {
    for (const [skillName, verb, expectedAgent] of [
      ['plan', 'init', 'diffpi-worker'],
      ['plan', 'new', 'diffpi-planner'],
      ['plan', 'update', 'diffpi-planner'],
      ['plan', 'validate', 'diffpi-plan-reviewer'],
      ['plan', 'go', 'diffpi-orchestrator'],
      ['review', 'new', 'diffpi-worker'],
      ['review', 'auto', 'diffpi-reviewer'],
      ['review', 'address', 'diffpi-reviewer'],
    ] as const) {
      const workflow = await skill(skillName, `references/workflows/${verb}.md`);
      expect(workflow).toContain(expectedAgent);
      expect(workflow).not.toMatch(/(?:subagent_type|agentType):\s*["'`](?:planner|reviewer|worker|orchestrator)["'`]/);
    }
    expect(await agent('planner')).toContain('name: diffpi-planner');
    expect(await agent('plan-reviewer')).toContain('name: diffpi-plan-reviewer');
    expect(await agent('reviewer')).toContain('name: diffpi-reviewer');
  });

  it('repairs only agents via the doctor skill and makes DRAFT go readiness caller-owned', async () => {
    const doctor = await skill('diffpi-doctor', 'SKILL.md');
    const go = await skill('plan', 'references/workflows/go.md');
    expect(doctor).toContain('diffpi_doctor');
    expect(doctor).toContain('apply: false');
    expect(doctor).toContain('apply: true');
    expect(doctor).not.toContain('diffpi_setup');
    expect(doctor).not.toContain('scripts/');
    expect(go).toContain('**Status:** DRAFT` to `**Status:** READY');
    expect(go).toContain('separate `finalize` is not required');
    expect(go).not.toContain('diffpi_modes_');
  });

  it('starts init on a worker and sends only READY plans to execution', async () => {
    const init = await skill('plan', 'references/workflows/init.md');
    const go = await skill('plan', 'references/workflows/go.md');
    const worker = await agent('worker');
    const orchestrator = await agent('orchestrator');
    const planner = await agent('planner');
    expect(init).toContain('low `diffpi-worker`');
    expect(worker).toContain('`/plan init`');
    expect(worker).toContain('initial DRAFT/INCOMPLETE');
    expect(go).toContain('If already READY, **skip validate**');
    expect(go).toContain('Do not send DRAFT to the orchestrator');
    expect(go).toContain('medium `diffpi-orchestrator`');
    expect(orchestrator).toContain('require a READY live plan');
    expect(orchestrator).toContain('Do not run structural readiness checks');
    expect(planner).toContain('model: openai-codex/gpt-5.6-sol');
    expect(planner).not.toMatch(/^thinking:/m);
  });
});
