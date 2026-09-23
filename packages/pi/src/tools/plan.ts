import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { resolveBundledAgentsDir } from '../assets';
import { diffpiLaunchName, openFileAdjacent, openInNewTab } from '../environment';
import { runMiseGates } from '../gates';
import type { ModeController } from '../modes';
import type { PlanDesign, PlanDocument, PlanPhase, PlanReference, PlanTask } from '../plan';
import { run, runChecked } from '../extensions/processx';
import { assertPhasePushEligible, retryPlanCi, updatePlanCi, updatePlanStatus } from '../plan/operations';
import { countDesignWords, validatePlanDocument } from '../plan/markdown';
import { readPlanReview } from '../plan/reviews';
import { createPlanStore, type PlanStore } from '../plan/store';
import {
  planAddPhaseParametersSchema,
  planContextParametersSchema,
  planInitParametersSchema,
  planLogProgressParametersSchema,
  planLookupParametersSchema,
  planRemovePhaseParametersSchema,
  planRecordCiParametersSchema,
  planRunGatesParametersSchema,
  planStartExecutionParametersSchema,
  planUpdateOverviewParametersSchema,
  planUpdatePhaseParametersSchema,
  planUpdateStatusParametersSchema,
  planValidateParametersSchema,
  type PlanPhaseDraft,
  type PlanTaskDraft,
} from './plan-schema';

export type PlanToolRuntime = Pick<ExtensionAPI, 'events' | 'sendUserMessage'> &
  Partial<Pick<ExtensionAPI, 'sendMessage'>>;

export function createPlanTools(
  _pi: PlanToolRuntime,
  _modes: ModeController,
  store: PlanStore = createPlanStore(),
): readonly ToolDefinition[] {
  return [
    defineTool({
      name: 'plan_context',
      label: 'plan context',
      description: 'Resolve one plan and summarize all matching plans without guessing among ambiguous matches.',
      parameters: parameters(planContextParametersSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = planContextParametersSchema.parse(input);
        const resolution = await store.context(params.cwd ?? process.cwd(), params.plan, {
          branch: params.branch,
          statuses: params.statuses,
        });
        return result(
          resolution.candidates.length
            ? resolution.candidates
                .map(
                  (record) =>
                    `${record.id}: ${record.document.status} r${record.document.revision} (${record.document.branch})`,
                )
                .join('\n')
            : 'No matching plans.',
          { selected: resolution.record, candidates: resolution.candidates, ambiguous: resolution.ambiguous },
        );
      },
    }),
    defineTool({
      name: 'plan_init',
      label: 'plan init',
      description: 'Create a phase-less editable plan draft.',
      parameters: parameters(planInitParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planInitParametersSchema.parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const branch = params.branch ?? (await currentBranch(workingDirectory));
        const record = await store.init({ ...params, cwd: workingDirectory, branch });
        const launch =
          params.open === false
            ? undefined
            : await openFileAdjacent(record.planPath, {
                cwd: workingDirectory,
                name: diffpiLaunchName(workingDirectory, `plan ${record.id}`),
              });
        const link = `[${record.planPath}](${pathToFileURL(record.planPath).href})`;
        return result(`Created ${record.id} at ${link}.`, { record, launch });
      },
    }),
    defineTool({
      name: 'plan_update_overview',
      label: 'plan update overview',
      description: 'Replace selected plan overview fields using an expected plan revision.',
      parameters: parameters(planUpdateOverviewParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planUpdateOverviewParametersSchema.parse(input);
        const record = await store.mutate(params.cwd ?? process.cwd(), params.plan, 'update overview', (plan) => {
          assertAuthoringRevision(plan, params.expectedPlanRevision);
          assertAuthorable(plan);
          return resetDraft({
            ...plan,
            intent: params.intent ?? plan.intent,
            requirements: params.requirements ?? plan.requirements,
            design: (params.design as PlanDesign | undefined) ?? plan.design,
            references: (params.references as PlanReference[] | undefined) ?? plan.references,
          });
        });
        return result(`Updated ${record.id} to revision ${record.document.revision}.`, { record });
      },
    }),
    defineTool({
      name: 'plan_add_phase',
      label: 'plan add phase',
      description: 'Add an ordered phase with stable IDs.',
      parameters: parameters(planAddPhaseParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planAddPhaseParametersSchema.parse(input);
        const record = await store.mutate(params.cwd ?? process.cwd(), params.plan, 'add phase', (plan) => {
          assertAuthoringRevision(plan, params.expectedPlanRevision);
          assertAuthorable(plan);
          if (allIds(plan).has(params.phase.id)) throw new Error(`Duplicate stable ID: ${params.phase.id}.`);
          const phase = newPhase(params.phase);
          const phases = [...plan.phases];
          if (params.afterPhaseId) {
            const index = phases.findIndex((item) => item.id === params.afterPhaseId);
            if (index < 0) throw new Error(`Unknown phase: ${params.afterPhaseId}.`);
            phases.splice(index + 1, 0, phase);
          } else phases.push(phase);
          assertNewIds(plan, phase);
          return resetDraft({ ...plan, phases });
        });
        return result(`Added phase ${params.phase.id} to ${record.id}.`, { record });
      },
    }),
    defineTool({
      name: 'plan_remove_phase',
      label: 'plan remove phase',
      description: 'Remove an unfinished phase that has no dependents.',
      parameters: parameters(planRemovePhaseParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planRemovePhaseParametersSchema.parse(input);
        const record = await store.mutate(params.cwd ?? process.cwd(), params.plan, 'remove phase', (plan) => {
          assertAuthoringRevision(plan, params.expectedPlanRevision);
          assertAuthorable(plan);
          const phase = getPhase(plan, params.phaseId);
          if (phase.status === 'completed' || phase.tasks.some((task) => task.status === 'completed'))
            throw new Error(`Completed phase ${phase.id} cannot be removed.`);
          if (plan.phases.some((item) => item.dependencies.includes(phase.id)))
            throw new Error(`Phase ${phase.id} has dependents and cannot be removed.`);
          return resetDraft({ ...plan, phases: plan.phases.filter((item) => item.id !== phase.id) });
        });
        await store.log(params.cwd ?? process.cwd(), record.id, {
          planRevision: record.document.revision,
          kind: 'updated',
          actor: 'planner',
          message: `Removed phase ${params.phaseId}: ${params.reason}`,
          phaseId: params.phaseId,
        });
        return result(`Removed phase ${params.phaseId}.`, { record });
      },
    }),
    defineTool({
      name: 'plan_update_phase',
      label: 'plan update phase',
      description: 'Update an unfinished phase and its ordered tasks.',
      parameters: parameters(planUpdatePhaseParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planUpdatePhaseParametersSchema.parse(input);
        const record = await store.mutate(params.cwd ?? process.cwd(), params.plan, 'update phase', (plan) => {
          assertAuthoringRevision(plan, params.expectedPlanRevision);
          assertAuthorable(plan, params.phaseId);
          const existing = getPhase(plan, params.phaseId);
          if (existing.status === 'completed') throw new Error(`Completed phase ${existing.id} cannot be changed.`);
          const tasks = params.patch.tasks ? reconcileTasks(existing.tasks, params.patch.tasks) : existing.tasks;
          const updated: PlanPhase = {
            ...existing,
            title: params.patch.title ?? existing.title,
            objective: params.patch.objective ?? existing.objective,
            dependencies: params.patch.dependencies ?? existing.dependencies,
            tasks,
            revision: existing.revision + 1,
            status: existing.status === 'blocked' ? 'in_progress' : existing.status,
            gate: { ...existing.gate, status: 'stale' },
            blocker: existing.status === 'blocked' ? undefined : existing.blocker,
          };
          assertNewIds({ ...plan, phases: plan.phases.filter((phase) => phase.id !== existing.id) }, updated);
          return resetDraft({
            ...plan,
            phases: plan.phases.map((phase) => (phase.id === existing.id ? updated : phase)),
          });
        });
        return result(`Updated phase ${params.phaseId}.`, { record });
      },
    }),
    defineTool({
      name: 'plan_validate',
      label: 'plan validate',
      description: 'Validate plan markers, dependencies, completeness, and Design length.',
      parameters: parameters(planValidateParametersSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = planValidateParametersSchema.parse(input);
        const record = await store.read(params.cwd ?? process.cwd(), params.plan);
        const issues = validatePlanDocument(record.document, { strict: params.strict });
        const words = countDesignWords(record.document);
        return result(
          issues.length ? issues.map((issue) => `- ${issue.severity}: ${issue.message}`).join('\n') : 'Plan is valid.',
          { record, issues, designWordCount: words, ready: !issues.some((issue) => issue.severity === 'error') },
        );
      },
    }),
    defineTool({
      name: 'plan_log_progress',
      label: 'plan log progress',
      description: 'Append a progress event without changing plan revision.',
      parameters: parameters(planLogProgressParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planLogProgressParametersSchema.parse(input);
        const record = await store.read(params.cwd ?? process.cwd(), params.plan);
        const entry = await store.log(params.cwd ?? process.cwd(), params.plan, {
          planRevision: record.document.revision,
          kind: 'progress',
          actor: params.actor,
          message: params.message,
          executionId: params.executionId,
          phaseId: params.phaseId,
          taskId: params.taskId,
          evidence: params.evidence,
          data: params.data,
        });
        return result(`Logged ${entry.eventId}.`, { entry });
      },
    }),
    createStatusTool(store),
    defineTool({
      name: 'plan_run_gates',
      label: 'plan run gates',
      description: 'Run format check, lint, and tests without holding the plan lock, then persist non-stale results.',
      parameters: parameters(planRunGatesParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planRunGatesParametersSchema.parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const before = await store.read(workingDirectory, params.plan);
        const phase = getPhase(before.document, params.phaseId);
        if (phase.revision !== params.expectedPhaseRevision) throw new Error(`Stale phase revision for ${phase.id}.`);
        assertPhasePushEligible(before.document, phase.id, params.executionId);
        if (!before.document.execution?.active || before.document.execution.id !== params.executionId)
          throw new Error(`Execution ${params.executionId} does not own this plan.`);
        if (phase.tasks.some((task) => task.status !== 'completed' && task.status !== 'skipped'))
          throw new Error(`Phase ${phase.id} still has incomplete tasks.`);
        const results = await runMiseGates(workingDirectory);
        const passed = results.every((gate) => gate.status === 'pass' || gate.status === 'skip');
        const record = await store.mutate(workingDirectory, params.plan, 'persist gates', (plan) => {
          const current = getPhase(plan, params.phaseId);
          if (current.revision !== params.expectedPhaseRevision)
            throw new Error(`Gate results for ${current.id} are stale.`);
          assertPhasePushEligible(plan, current.id, params.executionId);
          if (current.tasks.some((task) => task.status !== 'completed' && task.status !== 'skipped'))
            throw new Error(`Gate results for ${current.id} are stale because task state changed.`);
          const updated: PlanPhase = {
            ...current,
            revision: current.revision + 1,
            gate: {
              phaseRevision: params.expectedPhaseRevision,
              status: passed ? 'passed' : 'failed',
              results,
              completedAt: new Date().toISOString(),
            },
          };
          return {
            ...heartbeat(plan),
            phases: plan.phases.map((item) => (item.id === updated.id ? updated : item)),
          };
        });
        await store.log(workingDirectory, record.id, {
          planRevision: record.document.revision,
          kind: 'gate',
          actor: params.actor,
          message: `Phase ${phase.id} gates ${passed ? 'passed' : 'failed'}.`,
          executionId: params.executionId,
          phaseId: phase.id,
          data: { results },
        });
        return result(results.map((gate) => `${gate.name}: ${gate.status} — ${gate.detail}`).join('\n'), {
          results,
          passed,
          record,
        });
      },
    }),
    defineTool({
      name: 'plan_record_ci',
      label: 'plan record CI',
      description: 'Persist a settled watch_ci result on one pushed plan phase commit.',
      parameters: parameters(planRecordCiParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planRecordCiParametersSchema.parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const before = await store.read(workingDirectory, params.plan);
        const phase = getPhase(before.document, params.phaseId);
        if (!before.document.execution?.active || before.document.execution.id !== params.executionId)
          throw new Error(`Execution ${params.executionId} does not own this plan.`);
        if (phase.commit?.sha !== params.sha) throw new Error(`Phase ${phase.id} is not committed at ${params.sha}.`);
        if (phase.commit.ci?.status === 'failed') {
          if (!params.retryReason) throw new Error(`CI for phase ${phase.id} failed; provide a retry reason.`);
          await retryPlanCi(store, workingDirectory, params.plan, {
            phaseId: params.phaseId,
            sha: params.sha,
            actor: params.actor,
            executionId: params.executionId,
            reason: params.retryReason,
          });
        } else {
          if (params.retryReason) throw new Error(`CI for phase ${phase.id} can retry only after failure.`);
          if (phase.commit.ci?.status !== 'pending')
            throw new Error(`CI for phase ${phase.id} is already ${phase.commit.ci?.status ?? 'untracked'}.`);
        }
        const record = await updatePlanCi(store, workingDirectory, params.plan, params);
        return result(`Recorded CI ${params.status} for ${params.phaseId}: ${params.detail}`, { record });
      },
    }),
    defineTool({
      name: 'plan_annotate',
      label: 'plan annotate',
      description: 'Launch tuicr for the selected plan and save a plan review when it closes.',
      parameters: parameters(planLookupParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planLookupParametersSchema.parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const resolution = await store.context(workingDirectory, params.plan);
        if (!resolution.record)
          throw new Error(
            resolution.ambiguous
              ? `Plan is ambiguous: ${resolution.candidates.map((item) => item.id).join(', ')}.`
              : 'No matching plan.',
          );
        const cliPath = join(resolveBundledAgentsDir(), '..', 'dist', 'cli.js');
        const command = [
          process.execPath,
          cliPath,
          'plan',
          'annotate',
          resolution.record.id,
          '--cwd',
          workingDirectory,
        ];
        const launched = await openInNewTab(command, {
          cwd: workingDirectory,
          name: diffpiLaunchName(workingDirectory, 'annotate plan'),
        });
        const fallbackCommand = `npx --yes @difflab/pi plan annotate ${resolution.record.id} --cwd ${JSON.stringify(workingDirectory)}`;
        return result(
          launched.launched
            ? `Opened ${resolution.record.id} for review.`
            : (launched.instruction ?? `Run: ${fallbackCommand}`),
          { record: resolution.record, launched, fallbackCommand, followUp: `/plan update ${resolution.record.id}` },
        );
      },
    }),
    defineTool({
      name: 'plan_review',
      label: 'plan review',
      description: 'Return the latest immutable tuicr review for the current plan revision.',
      parameters: parameters(planLookupParametersSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = planLookupParametersSchema.parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const resolution = await store.context(workingDirectory, params.plan);
        if (!resolution.record)
          throw new Error(
            resolution.ambiguous
              ? `Plan is ambiguous: ${resolution.candidates.map((item) => item.id).join(', ')}.`
              : 'No matching plan.',
          );
        const review = await readPlanReview(resolution.record);
        return result(
          review ? `Plan review: ${review.path}\n${review.dump.content}` : 'No plan review for the current revision.',
          {
            record: resolution.record,
            review,
          },
        );
      },
    }),
    defineTool({
      name: 'plan_start_execution',
      label: 'plan start execution',
      description: 'Initialize durable plan execution state and return the execution packet.',
      parameters: parameters(planStartExecutionParametersSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = planStartExecutionParametersSchema.parse(input);
        return startExecution(store, params);
      },
    }),
  ];
}

function createStatusTool(store: PlanStore): ToolDefinition {
  return defineTool({
    name: 'plan_update_status',
    label: 'plan update status',
    description: 'Apply an ownership-checked plan, phase, or task status transition and append an audit event.',
    parameters: parameters(planUpdateStatusParametersSchema),
    executionMode: 'sequential',
    async execute(_id, input) {
      const params = planUpdateStatusParametersSchema.parse(input);
      const workingDirectory = params.cwd ?? process.cwd();
      if (params.commit) {
        if (params.target.type !== 'phase' || params.status !== 'completed')
          throw new Error('Commit metadata is accepted only when completing a phase.');
        const verified = await verifyCommit(workingDirectory, params.commit.sha);
        if (verified.sha !== params.commit.sha && !verified.sha.startsWith(params.commit.sha))
          throw new Error(`Commit ${params.commit.sha} is not the current HEAD ${verified.sha}.`);
        if (verified.subject !== params.commit.subject)
          throw new Error(`Commit subject does not match HEAD: ${verified.subject}.`);
        if (params.commit.pushedAt) await verifyPushedCommit(workingDirectory, verified.sha);
        params.commit.sha = verified.sha;
      }
      const { record, escalation } = await updatePlanStatus(store, workingDirectory, params.plan, params);
      return result(`Updated ${params.target.type} to ${params.status}.`, { record, escalation });
    },
  });
}

function createExecutionPacket(plan: PlanDocument) {
  if (!plan.execution?.active) throw new Error(`Plan ${plan.id} has no active execution.`);
  return {
    version: 1,
    planId: plan.id,
    executionId: plan.execution.id,
    commitMode: plan.execution.commitMode,
    cwd: plan.execution.cwd,
    branch: plan.execution.branch,
    coordinator: 'orchestrator',
  };
}

function renderExecutionPrompt(packet: ReturnType<typeof createExecutionPacket>): string {
  return [
    `Execute the durable Diffpi plan using this packet: ${JSON.stringify(packet)}.`,
    'Call plan_context first and keep plan tools as the source of truth for eligibility, ownership, status, gates, and commits.',
    'Use SubagentWorkflow for deterministic multi-task coordination: pipeline dependent work, parallelize only tasks with non-overlapping declared file scopes, and use structured schemas for worker outcomes.',
    'The extension cannot launch workflow children over RPC, so the active orchestrator must invoke SubagentWorkflow itself.',
    'Persist every transition, progress event, issue, and deviation. Do not edit PLAN.md directly. Delegated implementation workers never commit or restructure the plan.',
    'In commit mode, create one local commit after each phase passes its gates and do not push. In push mode, commit and push each phase, record pending CI, and launch a bounded background Worker to call watch_ci for the exact SHA and then plan_record_ci for the phase while the next phase executes. Collect that monitor before the next push and collect all monitors before plan completion; failed or timed-out CI blocks execution.',
  ].join(' ');
}

async function startExecution(
  store: PlanStore,
  params: {
    cwd?: string;
    plan: string;
    commitMode: 'no-commit' | 'commit' | 'push';
    actor: string;
  },
) {
  const workingDirectory = params.cwd ?? process.cwd();
  const before = await store.read(workingDirectory, params.plan);
  if (before.document.execution?.active) throw new Error(`Plan ${before.id} already has an active execution.`);
  if (before.document.status !== 'ready' && before.document.status !== 'blocked')
    throw new Error(`Plan ${before.id} must be ready or blocked before execution.`);
  const branch = await currentBranch(workingDirectory);
  if (branch !== before.document.branch)
    throw new Error(`Plan branch is ${before.document.branch}; current branch is ${branch}.`);
  if (params.commitMode !== 'no-commit') {
    const dirty = await runChecked('git', ['-C', workingDirectory, 'status', '--porcelain']);
    if (dirty.stdout.trim())
      throw new Error(`${params.commitMode} mode requires a clean worktree:\n${dirty.stdout.trim()}`);
  }
  const head = (await runChecked('git', ['-C', workingDirectory, 'rev-parse', 'HEAD'])).stdout.trim();
  const executionId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const record = await store.mutate(workingDirectory, before.id, 'start execution', (plan) => {
    if (plan.execution?.active) throw new Error(`Plan ${plan.id} already has an active execution.`);
    if (plan.status !== 'ready' && plan.status !== 'blocked')
      throw new Error(`Plan ${plan.id} must be ready or blocked before execution.`);
    if (plan.branch !== branch) throw new Error(`Plan branch is ${plan.branch}; current branch is ${branch}.`);
    if (params.commitMode === 'no-commit' && plan.phases.some((phase) => phase.commit))
      throw new Error('A plan with recorded phase commits cannot restart in no-commit mode.');
    return {
      ...plan,
      status: 'in_progress',
      execution: {
        id: executionId,
        commitMode: params.commitMode,
        cwd: workingDirectory,
        branch: plan.branch,
        baseHead: head,
        actor: params.actor,
        startedAt: timestamp,
        heartbeatAt: timestamp,
        active: true,
      },
    };
  });
  await store.log(workingDirectory, record.id, {
    planRevision: record.document.revision,
    kind: 'execution',
    actor: params.actor,
    message: `Started ${params.commitMode} execution ${executionId}.`,
    executionId,
  });
  const packet = createExecutionPacket(record.document);
  return result(`Initialized execution ${executionId}.`, {
    record,
    executionId,
    packet,
    prompt: renderExecutionPrompt(packet),
  });
}

function newPhase(input: PlanPhaseDraft): PlanPhase {
  return {
    id: input.id,
    revision: 0,
    title: input.title,
    objective: input.objective,
    dependencies: input.dependencies ?? [],
    tasks: (input.tasks ?? []).map(newTask),
    status: 'pending',
    gate: { phaseRevision: 0, status: 'pending', results: [] },
  };
}

function newTask(input: PlanTaskDraft): PlanTask {
  return {
    id: input.id,
    revision: 0,
    title: input.title,
    steps: input.steps,
    dependencies: input.dependencies ?? [],
    fileScopes: input.fileScopes ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    status: 'pending',
  };
}

function reconcileTasks(existing: readonly PlanTask[], drafts: readonly PlanTaskDraft[]): PlanTask[] {
  const byId = new Map(existing.map((task) => [task.id, task]));
  const requested = new Set(drafts.map((task) => task.id));
  const protectedTask = existing.find(
    (task) => (task.status === 'completed' || task.status === 'in_progress') && !requested.has(task.id),
  );
  if (protectedTask)
    throw new Error(
      `${protectedTask.status === 'completed' ? 'Completed' : 'Active'} task ${protectedTask.id} cannot be removed.`,
    );
  return drafts.map((draft) => {
    const current = byId.get(draft.id);
    if (current?.status === 'completed' || current?.status === 'in_progress') return current;
    return current
      ? {
          ...newTask(draft),
          revision: current.revision + 1,
          status: current.status === 'blocked' ? 'pending' : current.status,
          owner: current.status === 'blocked' ? undefined : current.owner,
          executionId: current.status === 'blocked' ? undefined : current.executionId,
          blocker: current.status === 'blocked' ? undefined : current.blocker,
        }
      : newTask(draft);
  });
}

function assertAuthoringRevision(plan: PlanDocument, expected: number): void {
  if (plan.revision !== expected) throw new Error(`Stale plan revision: expected ${expected}, found ${plan.revision}.`);
}

function assertAuthorable(plan: PlanDocument, blockedPhaseId?: string): void {
  if (plan.status === 'completed') throw new Error('Completed plans cannot be structurally changed.');
  if (!plan.execution?.active) return;
  if (!blockedPhaseId) throw new Error('An active execution owns this plan.');
  const phase = getPhase(plan, blockedPhaseId);
  if (phase.status !== 'blocked' && !phase.tasks.some((task) => task.status === 'blocked'))
    throw new Error('Planner may amend only blocked work during an active execution.');
}

function resetDraft(plan: PlanDocument): PlanDocument {
  if (plan.status === 'blocked' && plan.execution?.active) return { ...plan, status: 'in_progress' };
  return plan.status === 'ready' || plan.status === 'blocked' ? { ...plan, status: 'draft' } : plan;
}

function allIds(plan: PlanDocument): Set<string> {
  return new Set([plan.id, ...plan.phases.flatMap((phase) => [phase.id, ...phase.tasks.map((task) => task.id)])]);
}

function assertNewIds(plan: PlanDocument, phase: PlanPhase): void {
  const known = allIds(plan);
  for (const candidate of [phase.id, ...phase.tasks.map((task) => task.id)]) {
    if (known.has(candidate)) throw new Error(`Duplicate stable ID: ${candidate}.`);
    known.add(candidate);
  }
}

function getPhase(plan: PlanDocument, phaseId: string): PlanPhase {
  const phase = plan.phases.find((item) => item.id === phaseId);
  if (!phase) throw new Error(`Unknown phase: ${phaseId}.`);
  return phase;
}

function heartbeat(plan: PlanDocument): PlanDocument {
  return plan.execution?.active
    ? { ...plan, execution: { ...plan.execution, heartbeatAt: new Date().toISOString() } }
    : plan;
}

async function verifyCommit(cwd: string, requestedSha: string): Promise<{ sha: string; subject: string }> {
  await runChecked('git', ['-C', cwd, 'cat-file', '-e', `${requestedSha}^{commit}`]);
  const [sha, subject] = await Promise.all([
    runChecked('git', ['-C', cwd, 'rev-parse', 'HEAD']),
    runChecked('git', ['-C', cwd, 'log', '-1', '--format=%s']),
  ]);
  return { sha: sha.stdout.trim(), subject: subject.stdout.trim() };
}

async function verifyPushedCommit(cwd: string, sha: string): Promise<void> {
  const upstream = await runChecked('git', ['-C', cwd, 'rev-parse', '@{upstream}']);
  if (upstream.stdout.trim() !== sha)
    throw new Error(`Commit ${sha} must be pushed to the current branch upstream before phase completion.`);
}

async function currentBranch(cwd: string): Promise<string> {
  const result = await run('git', ['-C', cwd, 'branch', '--show-current']);
  if (result.code !== 0 || !result.stdout.trim()) throw new Error(`Cannot determine current branch in ${cwd}.`);
  return result.stdout.trim();
}

function parameters(schema: z.ZodTypeAny): ToolDefinition['parameters'] {
  return z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'];
}

function result(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}
