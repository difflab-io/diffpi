import type { PlanPhaseStatus, PlanStatus, PlanTask, PlanTaskStatus } from './types';

export const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export function isStableId(value: string): boolean {
  return STABLE_ID.test(value) && value.length <= 80;
}

export function assertStableId(value: string, label = 'identifier'): void {
  if (!isStableId(value)) throw new Error(`${label} must be a lowercase stable slug, not a path: ${value}`);
}

export function assertPlanTransition(from: PlanStatus, to: PlanStatus): void {
  if (from === to) return;
  if (!PLAN_TRANSITIONS[from].includes(to)) throw new Error(`Invalid plan status transition: ${from} -> ${to}.`);
}

export function assertPhaseTransition(from: PlanPhaseStatus, to: PlanPhaseStatus): void {
  if (from === to) return;
  if (!WORK_TRANSITIONS[from].includes(to)) throw new Error(`Invalid phase status transition: ${from} -> ${to}.`);
}

export function assertTaskTransition(task: PlanTask, to: PlanTaskStatus, executionId?: string, actor?: string): void {
  if (task.status !== to && !WORK_TRANSITIONS[task.status].includes(to)) {
    throw new Error(`Invalid task status transition: ${task.status} -> ${to}.`);
  }
  if (task.status === 'in_progress' && task.executionId && executionId !== task.executionId) {
    throw new Error(`Task ${task.id} is owned by execution ${task.executionId}.`);
  }
  if (task.status === 'in_progress' && task.owner && actor && actor !== task.owner) {
    throw new Error(`Task ${task.id} is owned by ${task.owner}.`);
  }
}

export function assertUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    assertStableId(id, label);
    if (seen.has(id)) throw new Error(`Duplicate ${label}: ${id}.`);
    seen.add(id);
  }
}
