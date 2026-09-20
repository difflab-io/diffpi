import type { PlanDocument, PlanExecutionPolicy, PlanPhase, PlanTask } from './types';

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
  return `Execute the durable Diffpi plan using this packet: ${JSON.stringify(packet)}. Call plan_context first. Coordinate eligible work, persist every transition and progress event, run phase gates, and honor the commit policy. Do not edit PLAN.md directly. Delegated workers never commit or restructure the plan.`;
}

export function eligiblePlanTasks(plan: PlanDocument): Array<{ phase: PlanPhase; task: PlanTask }> {
  const completedPhases = new Set(
    plan.phases.filter((phase) => phase.status === 'completed' || phase.status === 'skipped').map((phase) => phase.id),
  );
  const completedTasks = new Set(
    plan.phases
      .flatMap((phase) => phase.tasks)
      .filter((task) => task.status === 'completed' || task.status === 'skipped')
      .map((task) => task.id),
  );
  for (const phase of plan.phases) {
    if (phase.status === 'completed' || phase.status === 'skipped') continue;
    if (!phase.dependencies.every((dependency) => completedPhases.has(dependency))) continue;
    return phase.tasks
      .filter(
        (task) => task.status === 'pending' && task.dependencies.every((dependency) => completedTasks.has(dependency)),
      )
      .map((task) => ({ phase, task }));
  }
  return [];
}

export function tasksMayRunInParallel(left: PlanTask, right: PlanTask): boolean {
  if (!left.fileScopes.length || !right.fileScopes.length) return false;
  if (left.dependencies.includes(right.id) || right.dependencies.includes(left.id)) return false;
  return left.fileScopes.every((scope) => right.fileScopes.every((other) => !scopesOverlap(scope, other)));
}

export function phaseCommitCommand(policy: PlanExecutionPolicy): string | undefined {
  return policy === 'commit-per-phase' ? '/git commit --yes --no-push' : undefined;
}

function scopesOverlap(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/^\.\//, '').replace(/\*.*$/, '').replace(/\/$/, '');
  const a = normalize(left);
  const b = normalize(right);
  return !a || !b || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
