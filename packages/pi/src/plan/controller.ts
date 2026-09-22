import { renderSubagentEscalation, type SubagentEscalation } from '../extensions/subagentx';
import { annotatePlan, readPlanAnnotations, type PlanAnnotationRuntime } from './annotations';
import { createExecutionPacket, renderExecutionPrompt, type PlanExecutionPacket } from './execution';
import { countDesignWords, validatePlanDocument } from './markdown';
import { createPlanStore, type PlanStore, type PlanStoreOptions } from './store';
import { assertStableId } from './ids';
import type {
  PlanBlocker,
  PlanCiStatus,
  PlanCommit,
  PlanDocument,
  PlanPhase,
  PlanPhaseStatus,
  PlanRecord,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  PlanValidationIssue,
  PlanValidationOptions,
} from './types';

export interface PlanStatusUpdate {
  target: { type: 'plan' | 'phase' | 'task'; id?: string };
  expectedStatus: PlanStatus | PlanPhaseStatus;
  status: PlanStatus | PlanPhaseStatus;
  actor: string;
  message: string;
  executionId?: string;
  evidence?: string[];
  blockedReason?: string;
  attempts?: string[];
  needsUserDecision?: boolean;
  commit?: PlanCommit;
}

export interface PlanStatusUpdateResult {
  record: PlanRecord;
  escalation?: SubagentEscalation;
}

export interface PlanCiUpdate {
  phaseId: string;
  sha: string;
  status: Exclude<PlanCiStatus, 'pending'>;
  actor: string;
  executionId: string;
  detail: string;
}

export interface PlanCiRetry {
  phaseId: string;
  sha: string;
  actor: string;
  executionId: string;
  reason: string;
}

export interface PlanController {
  context: PlanStore['context'];
  create: PlanStore['init'];
  read: PlanStore['read'];
  update: PlanStore['mutate'];
  appendLog: PlanStore['log'];
  updateStatus(cwd: string, query: string, input: PlanStatusUpdate): Promise<PlanStatusUpdateResult>;
  updateCi(cwd: string, query: string, input: PlanCiUpdate): Promise<PlanRecord>;
  retryCi(cwd: string, query: string, input: PlanCiRetry): Promise<PlanRecord>;
  assertPhasePushEligible(document: PlanDocument, phaseId: string, executionId: string): void;
  validate(document: PlanDocument, options?: PlanValidationOptions): PlanValidationIssue[];
  countDesignWords(document: PlanDocument): number;
  annotate(record: PlanRecord, runtime?: PlanAnnotationRuntime): ReturnType<typeof annotatePlan>;
  annotations(
    record: PlanRecord,
    options?: { runtime?: PlanAnnotationRuntime },
  ): ReturnType<typeof readPlanAnnotations>;
  executionPacket(document: PlanDocument): PlanExecutionPacket;
  executionPrompt(packet: PlanExecutionPacket): string;
  renderEscalation(escalation: SubagentEscalation): string;
  assertStableId(value: string, label?: string): void;
}

export function createPlanController(options: PlanStoreOptions = {}): PlanController {
  const store = createPlanStore(options);
  const controller: PlanController = {
    context: store.context,
    create: store.init,
    read: store.read,
    update: store.mutate,
    appendLog: store.log,
    updateStatus: (cwd, query, input) => updateStatus(store, cwd, query, input),
    updateCi: (cwd, query, input) => updateCi(store, cwd, query, input),
    retryCi: (cwd, query, input) => retryCi(store, cwd, query, input),
    assertPhasePushEligible,
    validate: validatePlanDocument,
    countDesignWords,
    annotate: annotatePlan,
    annotations: readPlanAnnotations,
    executionPacket: createExecutionPacket,
    executionPrompt: renderExecutionPrompt,
    renderEscalation: renderSubagentEscalation,
    assertStableId,
  };
  return controller;
}

async function updateStatus(
  store: PlanStore,
  cwd: string,
  query: string,
  input: PlanStatusUpdate,
): Promise<PlanStatusUpdateResult> {
  let escalation: SubagentEscalation | undefined;
  const record = await store.mutate(cwd, query, 'update status', (plan) => {
    if (input.target.type === 'plan') {
      if (plan.status !== input.expectedStatus)
        throw new Error(`Expected plan status ${input.expectedStatus}, found ${plan.status}.`);
      assertPlanTransition(plan.status, input.status as PlanStatus);
      if (input.status === 'ready') {
        const errors = validatePlanDocument(plan, { strict: true }).filter((issue) => issue.severity === 'error');
        if (errors.length)
          throw new Error(`Plan cannot become ready: ${errors.map((issue) => issue.message).join(' ')}`);
      }
      if ((input.status === 'blocked' || input.status === 'completed') && plan.status === 'in_progress')
        assertExecutionOwner(plan, input.executionId);
      if (
        input.status === 'completed' &&
        plan.phases.some((phase) => phase.status !== 'completed' && phase.status !== 'skipped')
      )
        throw new Error('Every phase must be complete or skipped before the plan completes.');
      if (input.status === 'completed' && plan.execution?.commitMode === 'push') {
        const unsettled = plan.phases.filter(
          (phase) =>
            phase.status === 'completed' &&
            (!phase.commit?.pushedAt || !['passed', 'skipped'].includes(phase.commit.ci?.status ?? 'pending')),
        );
        if (unsettled.length)
          throw new Error(`CI must settle successfully for phases: ${unsettled.map((phase) => phase.id).join(', ')}.`);
      }
      return {
        ...heartbeat(plan),
        status: input.status as PlanStatus,
        execution:
          input.status === 'completed' || input.status === 'blocked'
            ? plan.execution && { ...plan.execution, active: false, heartbeatAt: new Date().toISOString() }
            : plan.execution,
      };
    }

    if (!input.target.id) throw new Error('Target ID is required.');
    const phase =
      input.target.type === 'phase' ? getPhase(plan, input.target.id) : findTaskPhase(plan, input.target.id);
    if (input.target.type === 'phase') {
      if (phase.status !== input.expectedStatus)
        throw new Error(`Expected phase status ${input.expectedStatus}, found ${phase.status}.`);
      if (phase.status === 'completed') throw new Error(`Completed phase ${phase.id} cannot transition again.`);
      assertExecutionOwner(plan, input.executionId);
      assertPhaseTransition(phase.status, input.status as PlanPhaseStatus);
      if (input.status === 'in_progress' || input.status === 'completed') assertPhaseDependenciesSatisfied(plan, phase);
      if (input.status === 'completed') {
        if (phase.tasks.some((task) => task.status !== 'completed' && task.status !== 'skipped'))
          throw new Error('All phase tasks must be complete or skipped.');
        if (phase.gate.status !== 'passed') throw new Error('Phase gates must pass before completion.');
        if (plan.execution?.commitMode === 'push') assertPhasePushEligible(plan, phase.id, input.executionId!);
        if (plan.execution?.commitMode !== 'no-commit' && !input.commit)
          throw new Error(`${plan.execution?.commitMode} execution requires commit metadata before phase completion.`);
        if (plan.execution?.commitMode === 'push' && (!input.commit?.pushedAt || input.commit.ci?.status !== 'pending'))
          throw new Error('Push execution requires a pushed commit with pending CI monitoring.');
        if (plan.execution?.commitMode === 'commit' && (input.commit?.pushedAt || input.commit?.ci))
          throw new Error('Commit execution cannot record a push or remote CI monitoring.');
        if (plan.execution?.commitMode === 'no-commit' && input.commit)
          throw new Error('No-commit execution cannot record a phase commit.');
      }
      const updated: PlanPhase = {
        ...phase,
        status: input.status as PlanPhaseStatus,
        revision: phase.revision + 1,
        commit: input.commit ?? phase.commit,
        blocker: input.blockedReason ? blocker(input) : phase.blocker,
      };
      if (input.status === 'blocked' && input.blockedReason)
        escalation = escalationFor(plan, updated.id, undefined, input);
      const phases = plan.phases.map((item) => {
        if (item.id === updated.id) return updated;
        if (
          input.status === 'completed' &&
          plan.execution?.commitMode !== 'no-commit' &&
          input.commit &&
          item.status !== 'completed' &&
          item.status !== 'skipped' &&
          item.gate.status === 'passed'
        )
          return { ...item, gate: { ...item.gate, status: 'stale' as const } };
        return item;
      });
      return { ...heartbeat(plan), phases };
    }

    const task = getTask(phase, input.target.id);
    if (task.status !== input.expectedStatus)
      throw new Error(`Expected task status ${input.expectedStatus}, found ${task.status}.`);
    assertExecutionOwner(plan, input.executionId);
    assertTaskTransition(task, input.status as PlanTaskStatus, input.executionId, input.actor);
    if (input.status === 'in_progress' || input.status === 'completed') {
      if (phase.status !== 'in_progress') throw new Error(`Phase ${phase.id} is not in progress.`);
      assertTaskDependenciesSatisfied(plan, task);
    }
    const updatedTask: PlanTask = {
      ...task,
      status: input.status as PlanTaskStatus,
      revision: task.revision + 1,
      owner: input.status === 'in_progress' ? input.actor : task.owner,
      executionId: input.status === 'in_progress' ? input.executionId : task.executionId,
      blocker: input.blockedReason ? blocker(input) : task.blocker,
    };
    if (input.status === 'blocked' && input.blockedReason) escalation = escalationFor(plan, phase.id, task.id, input);
    const updatedPhase: PlanPhase = {
      ...phase,
      revision: phase.revision + 1,
      tasks: phase.tasks.map((item) => (item.id === updatedTask.id ? updatedTask : item)),
    };
    return {
      ...heartbeat(plan),
      phases: plan.phases.map((item) => (item.id === updatedPhase.id ? updatedPhase : item)),
    };
  });

  await store.log(cwd, record.id, {
    planRevision: record.document.revision,
    kind: input.status === 'blocked' ? 'blocker' : 'status',
    actor: input.actor,
    message: input.message,
    executionId: input.executionId,
    phaseId:
      input.target.type === 'phase'
        ? input.target.id
        : (escalation?.correlation.parentUnitId ?? escalation?.correlation.unitId),
    taskId: input.target.type === 'task' ? input.target.id : undefined,
    evidence: input.evidence,
  });
  return { record, escalation };
}

async function updateCi(store: PlanStore, cwd: string, query: string, input: PlanCiUpdate): Promise<PlanRecord> {
  const record = await store.mutate(cwd, query, 'update CI status', (plan) => {
    assertExecutionOwner(plan, input.executionId);
    if (plan.execution?.commitMode !== 'push') throw new Error('CI status applies only to push execution.');
    const phase = getPhase(plan, input.phaseId);
    if (phase.status !== 'completed') throw new Error(`Phase ${phase.id} must be completed before CI can settle.`);
    if (!phase.commit || phase.commit.sha !== input.sha)
      throw new Error(`Phase ${phase.id} is not committed at ${input.sha}.`);
    const current = phase.commit.ci?.status;
    if (current !== 'pending') throw new Error(`CI for phase ${phase.id} is already ${current ?? 'untracked'}.`);
    const timestamp = new Date().toISOString();
    const updated: PlanPhase = {
      ...phase,
      revision: phase.revision + 1,
      commit: {
        ...phase.commit,
        ci: {
          ...phase.commit.ci,
          status: input.status,
          startedAt: phase.commit.ci?.startedAt ?? timestamp,
          completedAt: timestamp,
          detail: input.detail,
        },
      },
    };
    return {
      ...heartbeat(plan),
      phases: plan.phases.map((item) => (item.id === updated.id ? updated : item)),
    };
  });
  await store.log(cwd, record.id, {
    planRevision: record.document.revision,
    kind: 'gate',
    actor: input.actor,
    message: `CI ${input.status} for ${input.phaseId}: ${input.detail}`,
    executionId: input.executionId,
    phaseId: input.phaseId,
    evidence: [input.sha],
  });
  return record;
}

async function retryCi(store: PlanStore, cwd: string, query: string, input: PlanCiRetry): Promise<PlanRecord> {
  let previousDetail: string | undefined;
  const record = await store.mutate(cwd, query, 'retry CI', (plan) => {
    assertExecutionOwner(plan, input.executionId);
    if (plan.execution?.commitMode !== 'push') throw new Error('CI retry applies only to push execution.');
    const phase = getPhase(plan, input.phaseId);
    if (phase.status !== 'completed') throw new Error(`Phase ${phase.id} must be completed before CI can retry.`);
    if (!phase.commit || phase.commit.sha !== input.sha)
      throw new Error(`Phase ${phase.id} is not committed at ${input.sha}.`);
    if (phase.commit.ci?.status !== 'failed')
      throw new Error(`CI for phase ${phase.id} cannot retry from ${phase.commit.ci?.status ?? 'untracked'}.`);
    previousDetail = phase.commit.ci.detail;
    const updated: PlanPhase = {
      ...phase,
      revision: phase.revision + 1,
      commit: {
        ...phase.commit,
        ci: { status: 'pending', startedAt: new Date().toISOString() },
      },
    };
    return {
      ...heartbeat(plan),
      phases: plan.phases.map((item) => (item.id === updated.id ? updated : item)),
    };
  });
  await store.log(cwd, record.id, {
    planRevision: record.document.revision,
    kind: 'gate',
    actor: input.actor,
    message: `Retrying CI for ${input.phaseId}: ${input.reason}`,
    executionId: input.executionId,
    phaseId: input.phaseId,
    evidence: [input.sha],
    data: { previousStatus: 'failed', previousDetail },
  });
  return record;
}

function assertPhasePushEligible(plan: PlanDocument, phaseId: string, executionId: string): void {
  assertExecutionOwner(plan, executionId);
  if (plan.execution?.commitMode !== 'push') return;
  const phaseIndex = plan.phases.findIndex((phase) => phase.id === phaseId);
  if (phaseIndex < 0) throw new Error(`Unknown phase: ${phaseId}.`);
  const unsettled = plan.phases.slice(0, phaseIndex).filter((phase) => {
    if (phase.status === 'skipped') return false;
    return (
      phase.status !== 'completed' ||
      !phase.commit?.pushedAt ||
      !['passed', 'skipped'].includes(phase.commit.ci?.status ?? 'pending')
    );
  });
  if (unsettled.length)
    throw new Error(
      `Prior phase CI must settle successfully before another push: ${unsettled.map((phase) => phase.id).join(', ')}.`,
    );
}

function assertPhaseDependenciesSatisfied(plan: PlanDocument, phase: PlanPhase): void {
  const unsettled = phase.dependencies
    .map((id) => getPhase(plan, id))
    .filter((dependency) => !dependencySatisfied(dependency.status));
  if (unsettled.length)
    throw new Error(
      `Phase ${phase.id} has incomplete dependencies: ${unsettled.map((dependency) => `${dependency.id} (${dependency.status})`).join(', ')}.`,
    );
}

function assertTaskDependenciesSatisfied(plan: PlanDocument, task: PlanTask): void {
  const tasks = plan.phases.flatMap((phase) => phase.tasks);
  const unsettled = task.dependencies
    .map((id) => {
      const dependency = tasks.find((candidate) => candidate.id === id);
      if (!dependency) throw new Error(`Unknown task dependency: ${id}.`);
      return dependency;
    })
    .filter((dependency) => !dependencySatisfied(dependency.status));
  if (unsettled.length)
    throw new Error(
      `Task ${task.id} has incomplete dependencies: ${unsettled.map((dependency) => `${dependency.id} (${dependency.status})`).join(', ')}.`,
    );
}

function dependencySatisfied(status: PlanPhaseStatus): boolean {
  return status === 'completed' || status === 'skipped';
}

const PLAN_TRANSITIONS: Readonly<Record<PlanStatus, readonly PlanStatus[]>> = {
  draft: ['ready'],
  ready: ['draft', 'in_progress'],
  in_progress: ['blocked', 'completed'],
  blocked: ['draft', 'ready', 'in_progress'],
  completed: [],
};

const WORK_TRANSITIONS: Readonly<Record<PlanPhaseStatus, readonly PlanPhaseStatus[]>> = {
  pending: ['in_progress', 'skipped'],
  in_progress: ['blocked', 'completed'],
  blocked: ['pending', 'in_progress', 'skipped'],
  completed: [],
  skipped: [],
};

function assertPlanTransition(from: PlanStatus, to: PlanStatus): void {
  if (from !== to && !PLAN_TRANSITIONS[from].includes(to))
    throw new Error(`Invalid plan status transition: ${from} -> ${to}.`);
}

function assertPhaseTransition(from: PlanPhaseStatus, to: PlanPhaseStatus): void {
  if (from !== to && !WORK_TRANSITIONS[from].includes(to))
    throw new Error(`Invalid phase status transition: ${from} -> ${to}.`);
}

function assertTaskTransition(task: PlanTask, to: PlanTaskStatus, executionId?: string, actor?: string): void {
  if (task.status !== to && !WORK_TRANSITIONS[task.status].includes(to))
    throw new Error(`Invalid task status transition: ${task.status} -> ${to}.`);
  if (task.status === 'in_progress' && task.executionId && executionId !== task.executionId)
    throw new Error(`Task ${task.id} is owned by execution ${task.executionId}.`);
  if (task.status === 'in_progress' && task.owner && actor && actor !== task.owner)
    throw new Error(`Task ${task.id} is owned by ${task.owner}.`);
}

function getPhase(plan: PlanDocument, phaseId: string): PlanPhase {
  const phase = plan.phases.find((item) => item.id === phaseId);
  if (!phase) throw new Error(`Unknown phase: ${phaseId}.`);
  return phase;
}

function findTaskPhase(plan: PlanDocument, taskId: string): PlanPhase {
  const phase = plan.phases.find((item) => item.tasks.some((task) => task.id === taskId));
  if (!phase) throw new Error(`Unknown task: ${taskId}.`);
  return phase;
}

function getTask(phase: PlanPhase, taskId: string): PlanTask {
  const task = phase.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}.`);
  return task;
}

function assertExecutionOwner(plan: PlanDocument, executionId?: string): void {
  if (!plan.execution?.active || !executionId || plan.execution.id !== executionId)
    throw new Error(`Execution ${executionId ?? '(missing)'} does not own this plan.`);
}

function blocker(input: PlanStatusUpdate): PlanBlocker {
  return {
    reason: input.blockedReason!,
    attempts: input.attempts,
    evidence: input.evidence,
    needsUserDecision: input.needsUserDecision,
  };
}

function escalationFor(
  plan: PlanDocument,
  phaseId: string,
  taskId: string | undefined,
  input: PlanStatusUpdate,
): SubagentEscalation {
  return {
    correlation: {
      workflow: 'plan',
      executionId: input.executionId!,
      unitId: taskId ?? phaseId,
      parentUnitId: taskId ? phaseId : undefined,
      metadata: { planId: plan.id },
    },
    blocker: input.blockedReason!,
    attempts: input.attempts ?? [],
    evidence: input.evidence ?? [],
    needsUserDecision: input.needsUserDecision ?? false,
  };
}

function heartbeat(plan: PlanDocument): PlanDocument {
  return plan.execution?.active
    ? { ...plan, execution: { ...plan.execution, heartbeatAt: new Date().toISOString() } }
    : plan;
}
