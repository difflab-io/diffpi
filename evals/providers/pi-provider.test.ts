/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import {
  assertPlanStage,
  assertCandidateCapabilities,
  captureRpcLaunches,
  captureChildLifecycle,
  observeRuntimeAgent,
  runtimeTierMatches,
  type BackgroundLaunch,
  type ChildLifecycle,
  workerResponse,
} from './pi-provider';

const request = 'Plan a playable two-player terminal tic-tac-toe game.';
const path = '/fixture/.diffpi/plan/260101-tic-tac-toe-cli/PLAN.md';
const author: BackgroundLaunch = {
  step: 'new',
  id: 'author',
  source: 'rpc',
  agentType: 'diffpi-planner',
  order: 1,
  prompt: `Draft a plan. Exact request: ${request} Absolute PLAN.md: ${path}`,
};
const validator: BackgroundLaunch = {
  ...author,
  id: 'validator',
  order: 4,
  prompt: `Validate this DRAFT. Exact request: ${request} Absolute PLAN.md: ${path}`,
};
const lifecycle: ChildLifecycle[] = [
  { step: 'new', id: 'author', event: 'started', status: 'running', order: 2 },
  { step: 'new', id: 'author', event: 'completed', status: 'completed', result: 'draft done', order: 3 },
  { step: 'new', id: 'validator', event: 'started', status: 'running', order: 5 },
  { step: 'new', id: 'validator', event: 'completed', status: 'completed', result: 'validation done', order: 6 },
];
const runtime = ['author', 'validator'].map((id) =>
  observeRuntimeAgent('new', id, {
    type: 'diffpi-planner',
    isBackground: true,
    session: { model: { provider: 'openai-codex', id: 'gpt-5.6-sol' }, thinkingLevel: 'high' },
  }),
);
const gate = (
  launches: BackgroundLaunch[] = [author, validator],
  events: ChildLifecycle[] = lifecycle,
  observed = runtime,
  step = 'new',
  exactRequest = request,
  target = path,
) => assertPlanStage(step, exactRequest, target, launches, events, observed);

describe('candidate infrastructure gates', () => {
  it('uses discovered skills without filtering arbitrary tools', () => {
    expect(() =>
      assertCandidateCapabilities({ skills: ['diffpi-plan'], tools: ['arbitrary'] }, ['diffpi-plan']),
    ).not.toThrow();
    expect(() => assertCandidateCapabilities({ skills: [], tools: [] }, ['diffpi-plan'])).toThrow(
      'missing package skill',
    );
  });
  it('captures transport-neutral RPC launches regardless of whether validation repeats the /skill prompt', () => {
    const bus = createEventBus();
    const launches: BackgroundLaunch[] = [];
    const stop = captureRpcLaunches(
      bus,
      () => ({ step: 'new', prompt: '/skill:diffpi-plan new tic-tac-toe-cli' }),
      (launch) => launches.push(launch),
      () => 1,
    );
    bus.emit('subagents:rpc:spawn', {
      requestId: 'r1',
      prompt: validator.prompt,
      type: 'diffpi-planner',
      options: { isBackground: true },
    });
    bus.emit('subagents:rpc:spawn:reply:r1', { success: true, data: { id: 'validator' } });
    bus.emit('subagents:rpc:spawn', {
      requestId: 'r2',
      prompt: author.prompt,
      type: 'diffpi-planner',
      options: { isBackground: false },
    });
    bus.emit('subagents:rpc:spawn:reply:r2', { success: true, data: { id: 'foreground' } });
    bus.emit('subagents:rpc:spawn', {
      requestId: 'r3',
      prompt: author.prompt,
      type: 'diffpi-planner',
      options: { isBackground: true },
    });
    bus.emit('subagents:rpc:spawn:reply:r3', { success: false });
    stop();
    expect(launches).toEqual([{ ...validator, order: 1 }]);
  });
});

describe('two-child plan stage evidence', () => {
  it('accepts an ordered new draft and separate high validator through either Agent or RPC', () => {
    expect(() => gate()).not.toThrow();
    expect(() =>
      gate([
        { ...author, source: 'Agent' },
        { ...validator, source: 'Agent' },
      ]),
    ).not.toThrow();
  });
  it('accepts low author and high validator for update only', () => {
    const launches = [author, validator].map((item) => ({ ...item, step: 'update' }));
    const events = lifecycle.map((item) => ({ ...item, step: 'update' }));
    const observed = runtime.map((item) => ({
      ...item,
      step: 'update',
      thinking: item.id === 'author' ? 'low' : 'high',
    }));
    expect(() => gate(launches, events, observed, 'update')).not.toThrow();
    expect(() =>
      gate(
        launches,
        events,
        runtime.map((item) => ({ ...item, step: 'update' })),
        'update',
      ),
    ).toThrow('frontier/low');
  });
  it('rejects missing validator, duplicate author and early validator', () => {
    expect(() => gate([author])).toThrow('distinct author and validator');
    expect(() => gate([author, { ...author, order: 4 }])).toThrow('distinct author and validator');
    expect(() => gate([author, { ...author, id: 'validator', order: 4 }])).toThrow(
      'validator task does not request validation',
    );
    expect(() => gate([author, { ...validator, order: 2 }])).toThrow('validator launched before author completed');
  });
  it('replays native completed event payloads without consumable session notifications', () => {
    const bus = createEventBus();
    const events: ChildLifecycle[] = [];
    const observed: typeof runtime = [];
    let sequence = 1;
    const stop = captureChildLifecycle(
      bus,
      () => 'new',
      () => ({
        type: 'diffpi-planner',
        isBackground: true,
        session: { model: { provider: 'openai-codex', id: 'gpt-5.6-sol' }, thinkingLevel: 'high' },
      }),
      (event, agent) => {
        events.push(event);
        observed.push(agent);
      },
      () => ++sequence,
    );
    // Recorded ordering: launch 1, started 2, completed 3, launch 4,
    // started 5, completed 6. get_subagent_result consumed both nudges.
    bus.emit('subagents:started', { id: author.id, type: 'diffpi-planner' });
    bus.emit('subagents:completed', { id: author.id, status: 'completed', result: 'draft done' });
    sequence = 4;
    bus.emit('subagents:started', { id: validator.id, type: 'diffpi-planner' });
    bus.emit('subagents:completed', { id: validator.id, status: 'completed', result: 'validation done' });
    stop();
    expect(events).toEqual(lifecycle);
    expect(() => gate(undefined, events, observed)).not.toThrow();
  });
  it('rejects missing or mismatched native completion results for either child', () => {
    expect(() =>
      gate(
        undefined,
        lifecycle.filter((item) => item.id !== 'validator'),
      ),
    ).toThrow('no attached background launch');
    expect(() =>
      gate(
        undefined,
        lifecycle.filter((item) => !(item.id === 'validator' && item.event === 'completed')),
      ),
    ).toThrow('did not complete');
    expect(() =>
      gate(
        undefined,
        lifecycle.map((item) =>
          item.id === 'author' && item.event === 'completed' ? { ...item, result: undefined } : item,
        ),
      ),
    ).toThrow('did not complete');
    expect(() =>
      gate(
        undefined,
        lifecycle.map((item) =>
          item.id === 'validator' && item.event === 'completed' ? { ...item, result: '  ' } : item,
        ),
      ),
    ).toThrow('did not complete');
    expect(() => gate(undefined, [...lifecycle.slice(0, 3), { ...lifecycle[3]!, status: 'partial' }])).toThrow(
      'failed or stopped',
    );
    expect(() =>
      gate(
        undefined,
        lifecycle.map((item) =>
          item.id === 'author' && item.event === 'completed' ? { ...item, step: 'update' } : item,
        ),
      ),
    ).toThrow('did not complete');
  });
  it('rejects wrong profile, effective tier and unobserved session data', () => {
    expect(() => gate([author, { ...validator, agentType: 'general-purpose' }])).toThrow('diffpi-planner');
    expect(() =>
      gate(
        undefined,
        undefined,
        runtime.map((item) => (item.id === 'validator' ? { ...item, thinking: 'low' } : item)),
      ),
    ).toThrow('frontier/high');
    expect(() =>
      gate(
        undefined,
        undefined,
        runtime.map((item) => (item.id === 'author' ? { ...item, sessionObserved: false } : item)),
      ),
    ).toThrow('not attested');
    expect(() =>
      gate(
        undefined,
        undefined,
        runtime.map((item) => (item.id === 'validator' ? { ...item, modelId: 'openai-codex/gpt-5.6-luna' } : item)),
      ),
    ).toThrow('not attested');
  });
  it('rejects wrong plan, wrong substantive request and unfilled placeholders', () => {
    expect(() => gate([author, { ...validator, prompt: validator.prompt!.replace(path, '/other/PLAN.md') }])).toThrow(
      'target',
    );
    expect(() =>
      gate([author, { ...validator, prompt: validator.prompt!.replace(request, 'something else') }]),
    ).toThrow('request');
    expect(() => gate([{ ...author, prompt: `${author.prompt} {brief-paths}` }, validator])).toThrow('placeholders');
    expect(() => gate(undefined, undefined, undefined, 'new', 'unrelated request')).toThrow('request');
  });
  it('cannot attest nested reviewer runtime via top-level child evidence', () => {
    expect(runtimeTierMatches('diffpi-plan-reviewer', { ...runtime[0]!, type: 'diffpi-plan-reviewer' })).toBe(true);
    expect(
      runtimeTierMatches('diffpi-plan-reviewer', {
        ...runtime[0]!,
        sessionObserved: false,
        type: 'diffpi-plan-reviewer',
      }),
    ).toBe(false);
  });
});

describe('worker transport', () => {
  const candidate = JSON.stringify({
    output: '# New stage',
    artifactDir: '/tmp/eval',
    sessionId: 's',
    sessionName: 'n',
  });
  it('returns infrastructure failures as errors, never quality candidates', () => {
    for (const reason of ['missing validator', 'duplicate author', 'wrong tier', 'wrong plan', 'partial child'])
      expect(workerResponse(1, candidate, reason)).toEqual({ error: `Pi case exited 1: ${reason}` });
  });
  it('rejects incomplete output and accepts complete output', () => {
    expect(workerResponse(0, '{', '')).toHaveProperty('error');
    expect(workerResponse(0, '{}', '')).toHaveProperty('error');
    expect(workerResponse(0, candidate, '')).toEqual({
      output: '# New stage',
      metadata: { artifactDir: '/tmp/eval', sessionId: 's', sessionName: 'n' },
    });
  });
});
