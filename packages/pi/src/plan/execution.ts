import type { PlanDocument, PlanExecutionPolicy } from './types';

export interface PlanExecutionPacket {
  version: 1;
  planId: string;
  executionId: string;
  policy: PlanExecutionPolicy;
  cwd: string;
  branch: string;
  coordinator: 'worker' | 'orchestrator';
}

export function createExecutionPacket(
  plan: PlanDocument,
  coordinator: PlanExecutionPacket['coordinator'],
): PlanExecutionPacket {
  if (!plan.execution?.active) throw new Error(`Plan ${plan.id} has no active execution.`);
  return {
    version: 1,
    planId: plan.id,
    executionId: plan.execution.id,
    policy: plan.execution.policy,
    cwd: plan.execution.cwd,
    branch: plan.execution.branch,
    coordinator,
  };
}

export function renderExecutionPrompt(packet: PlanExecutionPacket): string {
  return [
    `Execute the durable Diffpi plan using this packet: ${JSON.stringify(packet)}.`,
    'Call plan_context first and keep plan tools as the source of truth for eligibility, ownership, status, gates, and commits.',
    'Use SubagentWorkflow for deterministic multi-task coordination: pipeline dependent work, parallelize only tasks with non-overlapping declared file scopes, and use structured schemas for worker outcomes.',
    'The extension cannot launch workflow children over RPC, so the active orchestrator must invoke SubagentWorkflow itself.',
    'Persist every transition, progress event, issue, and deviation. Do not edit PLAN.md directly. Delegated implementation workers never commit or restructure the plan.',
    'For commit-per-phase execution, commit after local gates, push immediately, record pending CI on the completed phase, and launch a bounded background Worker to call plan_watch_ci for the exact SHA while the next phase executes. Collect that monitor before the next push and collect all monitors before plan completion; failed or timed-out CI blocks execution.',
  ].join(' ');
}
