/// <reference types="bun" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlanTools } from '../../src/tools/plan';

function statusTool(unset: () => Promise<{ ok: boolean; message: string }>) {
  const store = {
    mutate: async (_cwd: string, _query: string, _reason: string, mutate: (plan: any) => any) => ({
      id: 'demo',
      document: await mutate({
        id: 'demo',
        status: 'in_progress',
        phases: [],
        execution: { id: 'execution-one', active: true, commitMode: 'no-commit' },
      }),
    }),
    log: async () => undefined,
  };
  const tools = createPlanTools(
    { events: {}, sendUserMessage() {} } as any,
    { set: async () => ({ ok: true, message: '' }), unset } as any,
    store as any,
  );
  return tools.find((tool) => tool.name === 'plan_update_status')!;
}

function executionTool(options: {
  sendMessage?: () => void;
  setMode?: (agent: string) => Promise<{ ok: boolean; message: string }>;
  unsetMode?: () => Promise<{ ok: boolean; message: string }>;
  phases?: unknown[];
}) {
  const branch = 'feature/execution-test';
  const cwd = mkdtempSync(join(tmpdir(), 'diffpi-plan-tool-'));
  execFileSync('git', ['init', '-b', branch], { cwd, stdio: 'ignore' });
  writeFileSync(join(cwd, 'README.md'), '# Test\n');
  execFileSync('git', ['add', 'README.md'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.name=Diffpi', '-c', 'user.email=diffpi@example.com', 'commit', '-m', 'test: init'], {
    cwd,
    stdio: 'ignore',
  });
  const initial = {
    id: '260921-execution',
    branch,
    title: 'Execution',
    intent: 'Test execution.',
    requirements: [],
    design: { bigIdeas: '', keyApiUpdates: '', consequences: '' },
    references: [],
    status: 'ready',
    revision: 0,
    phases: options.phases ?? [],
    logs: [],
  };
  let document: any = structuredClone(initial);
  const record = (value: any) => ({
    id: value.id,
    dir: cwd,
    planPath: `${cwd}/PLAN.md`,
    logPath: `${cwd}/logs.txt`,
    source: '',
    document: value,
  });
  const store = {
    read: async () => record(structuredClone(initial)),
    mutate: async (_cwd: string, _query: string, _reason: string, mutate: (plan: any) => any) => {
      document = await mutate(structuredClone(document));
      document.revision += 1;
      return record(document);
    },
    log: async () => record(document),
  };
  let resets = 0;
  const selectedAgents: string[] = [];
  const tools = createPlanTools(
    { events: {}, sendMessage: options.sendMessage } as any,
    {
      set:
        options.setMode ??
        (async (agent: string) => {
          selectedAgents.push(agent);
          return { ok: true, message: `${agent} selected.` };
        }),
      unset:
        options.unsetMode ??
        (async () => {
          resets += 1;
          return { ok: true, message: 'Default mode restored.' };
        }),
    } as any,
    store as any,
  );
  return {
    tool: tools.find((tool) => tool.name === 'plan_start_execution')!,
    document: () => document,
    resets: () => resets,
    selectedAgents,
    cwd,
  };
}

const start = {
  plan: '260921-execution',
  commitMode: 'no-commit' as const,
  actor: 'orchestrator',
};

const completion = {
  plan: 'demo',
  target: { type: 'plan' as const },
  expectedStatus: 'in_progress' as const,
  status: 'completed' as const,
  actor: 'worker',
  message: 'Implementation complete.',
  executionId: 'execution-one',
};

describe('plan apply revision tool', () => {
  it('forwards the exact request and complete briefs in create mode', async () => {
    let received: any;
    const store = {
      applyRevision: async (_cwd: string, request: any) => {
        received = request;
        return { id: '260921-demo', document: { revision: 0 } };
      },
    };
    const tool = createPlanTools({ events: {} } as any, {} as any, store as any).find(
      (candidate) => candidate.name === 'plan_apply_revision',
    )!;
    const requestText = 'Exact user request\nwith a second line.';
    await tool.execute(
      'apply',
      {
        mode: 'create',
        shortSlug: 'demo',
        branch: 'feature/demo',
        title: 'Demo',
        request: { kind: 'user', text: requestText },
        intent: 'Create the plan.',
        requirements: ['Keep it complete.'],
        design: { bigIdeas: 'Use snapshots.', keyApiUpdates: 'Add apply.', consequences: 'Full input required.' },
        references: [],
        phases: [
          {
            id: 'phase-one',
            title: 'Phase one',
            objective: 'Implement it.',
            dependencies: [],
            tasks: [{ id: 'task-one', title: 'Implement', dependencies: [] }],
          },
        ],
        briefs: [
          {
            phaseId: 'phase-one',
            summary: 'Implement it.',
            apiChanges: [],
            libraries: [],
            constraints: [],
            tasks: [
              {
                taskId: 'task-one',
                steps: ['Edit code.'],
                fileScopes: ['src/**'],
                acceptanceCriteria: ['Tests pass.'],
              },
            ],
          },
        ],
      },
      undefined,
      undefined,
      {} as never,
    );

    expect(received.request.text).toBe(requestText);
    expect(received.briefs[0].tasks[0].steps).toEqual(['Edit code.']);
  });
});

describe('plan execution tool', () => {
  it('revalidates activation under the plan lock', async () => {
    const execution = executionTool({ sendMessage() {} });
    await execution.tool.execute('first', { ...start, cwd: execution.cwd }, undefined, undefined, {} as never);
    await expect(
      execution.tool.execute('second', { ...start, cwd: execution.cwd }, undefined, undefined, {} as never),
    ).rejects.toThrow('already has an active execution');
    expect(execution.document().execution.active).toBe(true);
    expect(execution.document().execution.commitMode).toBe('no-commit');
    expect(execution.selectedAgents).toEqual([]);
  });

  it('rejects downgrading committed work to no-commit', async () => {
    const execution = executionTool({
      sendMessage() {},
      phases: [{ id: 'phase-one', commit: { sha: 'a'.repeat(40) } }],
    });
    await expect(
      execution.tool.execute('start', { ...start, cwd: execution.cwd }, undefined, undefined, {} as never),
    ).rejects.toThrow('cannot restart in no-commit mode');
  });

  it('initializes state without dispatching an agent or changing the inline mode', async () => {
    const execution = executionTool({
      sendMessage() {
        throw new Error('plan_start_execution must not dispatch');
      },
    });
    const response = await execution.tool.execute(
      'start',
      { ...start, cwd: execution.cwd },
      undefined,
      undefined,
      {} as never,
    );
    expect(execution.document().status).toBe('in_progress');
    expect(execution.document().execution.active).toBe(true);
    expect(execution.selectedAgents).toEqual([]);
    expect(execution.resets()).toBe(0);
    expect(response.content[0]).toMatchObject({ type: 'text' });
  });
});

describe('plan status tool', () => {
  it('leaves command-layer mode ownership unchanged when the plan completes', async () => {
    let resets = 0;
    const tool = statusTool(async () => {
      resets += 1;
      return { ok: true, message: 'Default mode restored.' };
    });

    await tool.execute('complete', completion, undefined, undefined, {} as never);

    expect(resets).toBe(0);
  });
});
