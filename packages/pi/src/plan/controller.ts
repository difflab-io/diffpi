import { renderSubagentEscalation, type SubagentEscalation } from '../extensions/subagentx';
import {
  acknowledgePlanAnnotations,
  annotatePlan,
  readPlanAnnotations,
  type PlanAnnotationRuntime,
} from './annotations';
import { createExecutionPacket, renderExecutionPrompt, type PlanExecutionPacket } from './execution';
import { countDesignWords, validatePlanDocument } from './markdown';
import { createPlanStore, type PlanStore, type PlanStoreOptions } from './store';
import { assertStableId } from './ids';
import type {
  PlanBlocker,
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

export interface PlanController {
  context: PlanStore['context'];
  create: PlanStore['init'];
  read: PlanStore['read'];
  update: PlanStore['mutate'];
  appendLog: PlanStore['log'];
  updateStatus(cwd: string, query: string, input: PlanStatusUpdate): Promise<PlanStatusUpdateResult>;
  validate(document: PlanDocument, options?: PlanValidationOptions): PlanValidationIssue[];
  countDesignWords(document: PlanDocument): number;
  annotate(record: PlanRecord, runtime?: PlanAnnotationRuntime): ReturnType<typeof annotatePlan>;
  annotations(
    record: PlanRecord,
    options?: { includeApplied?: boolean; runtime?: PlanAnnotationRuntime },
  ): ReturnType<typeof readPlanAnnotations>;
  acknowledgeAnnotations(
    record: PlanRecord,
    commentIds: readonly string[],
    summary: string,
  ): ReturnType<typeof acknowledgePlanAnnotations>;
  executionPacket(document: PlanDocument, coordinator: PlanExecutionPacket['coordinator']): PlanExecutionPacket;
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
    validate: validatePlanDocument,
    countDesignWords,
    annotate: annotatePlan,
    annotations: readPlanAnnotations,
    acknowledgeAnnotations: acknowledgePlanAnnotations,
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
      assertExecutionOwner(plan, input.executionId);
      assertPhaseTransition(phase.status, input.status as PlanPhaseStatus);
      if (input.status === 'completed') {
        if (phase.tasks.some((task) => task.status !== 'completed' && task.status !== 'skipped'))
          throw new Error('All phase tasks must be complete or skipped.');
        if (phase.gate.status !== 'passed') throw new Error('Phase gates must pass before completion.');
        if (plan.execution?.policy === 'commit-per-phase' && !input.commit)
          throw new Error('Commit-per-phase execution requires commit metadata before phase completion.');
        if (plan.execution?.policy === 'no-commit' && input.commit)
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
      return {
        ...heartbeat(plan),
        phases: plan.phases.map((item) => (item.id === updated.id ? updated : item)),
      };
    }

    const task = getTask(phase, input.target.id);
    if (task.status !== input.expectedStatus)
      throw new Error(`Expected task status ${input.expectedStatus}, found ${task.status}.`);
    assertExecutionOwner(plan, input.executionId);
    assertTaskTransition(task, input.status as PlanTaskStatus, input.executionId, input.actor);
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
