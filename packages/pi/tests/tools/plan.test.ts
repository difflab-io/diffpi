/// <reference types="bun" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'bun:test';
import { createPlanTools } from '../../src/tools/plan';

function statusTool(mode: 'inline' | 'background', unset: () => Promise<{ ok: boolean; message: string }>) {
  const store = {
    updateStatus: async () => ({
      record: { document: { execution: { mode } } },
      escalation: undefined,
    }),
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
  setMode?: () => Promise<{ ok: boolean; message: string }>;
  unsetMode?: () => Promise<{ ok: boolean; message: string }>;
  phases?: unknown[];
}) {
  const branch = new TextDecoder().decode(Bun.spawnSync(['git', 'branch', '--show-current']).stdout).trim();
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
    dir: process.cwd(),
    planPath: `${process.cwd()}/PLAN.md`,
    logPath: `${process.cwd()}/logs.txt`,
    source: '',
    document: value,
  });
  const store = {
    read: async () => record(structuredClone(initial)),
    update: async (_cwd: string, _query: string, _reason: string, mutate: (plan: any) => any) => {
      document = await mutate(structuredClone(document));
      document.revision += 1;
      return record(document);
    },
    appendLog: async () => record(document),
    executionPacket: () => ({}),
    executionPrompt: () => 'Execute the plan.',
  };
  let resets = 0;
  const tools = createPlanTools(
    { events: {}, sendMessage: options.sendMessage } as any,
    {
      set: options.setMode ?? (async () => ({ ok: true, message: 'Worker selected.' })),
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
  };
}

function phaseUpdateTool() {
  const activeTask = {
    id: 'active-task',
    revision: 2,
    title: 'Active task',
    steps: ['Keep running'],
    dependencies: [],
    fileScopes: ['src/active.ts'],
    acceptanceCriteria: ['Still active'],
    status: 'in_progress',
    owner: 'worker',
    executionId: 'execution-one',
  };
  let document: any = {
    id: '260921-amendment',
    branch: 'feature/amendment',
    title: 'Amendment',
    intent: 'Test amendment.',
    requirements: [],
    design: { bigIdeas: '', keyApiUpdates: '', consequences: '' },
    references: [],
    status: 'blocked',
    revision: 3,
    execution: {
      id: 'execution-one',
      mode: 'background',
      policy: 'no-commit',
      cwd: process.cwd(),
      branch: 'feature/amendment',
      baseHead: '0123456',
      actor: 'orchestrator',
      startedAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString(),
      active: true,
    },
    phases: [
      {
        id: 'phase-one',
        revision: 2,
        title: 'Phase one',
        objective: 'Continue safely.',
        dependencies: [],
        status: 'blocked',
        gate: { phaseRevision: 2, status: 'passed', results: [] },
        blocker: { reason: 'Needs amendment.', attempts: [], needsUserDecision: false },
        tasks: [
          activeTask,
          {
            id: 'blocked-task',
            revision: 0,
            title: 'Blocked task',
            dependencies: [],
            fileScopes: [],
            acceptanceCriteria: [],
            status: 'blocked',
          },
        ],
      },
    ],
    logs: [],
  };
  const store = {
    update: async (_cwd: string, _query: string, _reason: string, mutate: (plan: any) => any) => {
      document = await mutate(structuredClone(document));
      document.revision += 1;
      return { id: document.id, document };
    },
    assertStableId() {},
    assertUniqueIds() {},
  };
  const tools = createPlanTools({ events: {} } as any, {} as any, store as any);
  return {
    tool: tools.find((tool) => tool.name === 'plan_update_phase')!,
    document: () => document,
    activeTask,
  };
}

const start = {
  plan: '260921-execution',
  mode: 'inline' as const,
  policy: 'no-commit' as const,
  actor: 'worker',
};

const completion = {
  plan: 'demo',
  target: { type: 'plan' as const },
  expectedStatus: 'in_progress' as const,
  status: 'completed' as const,
  actor: 'worker',
  message: 'Implementation complete.',
};

describe('plan update phase tool', () => {
  const draftTask = (id: string, title: string) => ({
    id,
    title,
    dependencies: [],
    fileScopes: [],
    acceptanceCriteria: [],
  });

  it('rejects omission of an active sibling task', async () => {
    const update = phaseUpdateTool();
    await expect(
      update.tool.execute(
        'update',
        {
          plan: '260921-amendment',
          expectedPlanRevision: 3,
          phaseId: 'phase-one',
          patch: { tasks: [draftTask('blocked-task', 'Blocked task')] },
        },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow('Active task active-task cannot be removed');
  });

  it('preserves active task state and invalidates the phase gate', async () => {
    const update = phaseUpdateTool();
    await update.tool.execute(
      'update',
      {
        plan: '260921-amendment',
        expectedPlanRevision: 3,
        phaseId: 'phase-one',
        patch: {
          objective: 'Amended objective.',
          tasks: [draftTask('active-task', 'Changed title'), draftTask('blocked-task', 'Retry blocked task')],
        },
      },
      undefined,
      undefined,
      {} as never,
    );
    expect(update.document().status).toBe('in_progress');
    expect(update.document().phases[0].tasks[0]).toEqual(update.activeTask);
    expect(update.document().phases[0].gate.status).toBe('stale');
  });
});

describe('plan execution tool', () => {
  it('revalidates activation under the plan lock', async () => {
    const execution = executionTool({ sendMessage() {} });
    await execution.tool.execute('first', start, undefined, undefined, { cwd: process.cwd() } as never);
    await expect(
      execution.tool.execute('second', start, undefined, undefined, { cwd: process.cwd() } as never),
    ).rejects.toThrow('already has an active execution');
    expect(execution.document().execution.active).toBe(true);
  });

  it('rejects downgrading committed work to no-commit', async () => {
    const execution = executionTool({
      sendMessage() {},
      phases: [{ id: 'phase-one', commit: { sha: 'a'.repeat(40) } }],
    });
    await expect(
      execution.tool.execute('start', start, undefined, undefined, { cwd: process.cwd() } as never),
    ).rejects.toThrow('cannot restart with no-commit');
  });

  it('compensates an inline dispatch failure and restores the default mode', async () => {
    const execution = executionTool({
      sendMessage() {
        throw new Error('dispatch unavailable');
      },
    });
    await expect(
      execution.tool.execute('start', start, undefined, undefined, { cwd: process.cwd() } as never),
    ).rejects.toThrow('blocked and inactive');
    expect(execution.document().status).toBe('blocked');
    expect(execution.document().execution.active).toBe(false);
    expect(execution.resets()).toBe(1);
  });
});

describe('plan CI tool', () => {
  it('rejects abbreviated commit SHAs before monitoring', async () => {
    const tools = createPlanTools({ events: {} } as any, {} as any, {} as any);
    const tool = tools.find((candidate) => candidate.name === 'plan_watch_ci')!;
    await expect(
      tool.execute(
        'watch',
        {
          plan: '260921-plan',
          phaseId: 'phase-one',
          sha: 'abcdef0',
          executionId: 'execution-one',
          actor: 'ci-monitor',
          timeoutSeconds: 30,
          pollSeconds: 2,
        },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow();
  });
});

describe('plan status tool', () => {
  it('returns an inline execution to the default mode when the plan completes', async () => {
    let resets = 0;
    const tool = statusTool('inline', async () => {
      resets += 1;
      return { ok: true, message: 'Default mode restored.' };
    });

    await tool.execute('complete', completion, undefined, undefined, {} as never);

    expect(resets).toBe(1);
  });

  it('does not change the foreground mode when a background execution completes', async () => {
    let resets = 0;
    const tool = statusTool('background', async () => {
      resets += 1;
      return { ok: true, message: 'Default mode restored.' };
    });

    await tool.execute('complete', completion, undefined, undefined, {} as never);

    expect(resets).toBe(0);
  });
});
