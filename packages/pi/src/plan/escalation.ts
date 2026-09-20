import { z } from 'zod';
import type { PlannerEscalation } from './types';

const escalationSchema = z
  .object({
    planId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    executionId: z.string().min(1),
    phaseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    taskId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    blocker: z.string().min(1),
    attempts: z.array(z.string()),
    evidence: z.array(z.string()),
    needsUserDecision: z.boolean(),
  })
  .strict();

const OPEN = '<diffpi-planner-escalation>';
const CLOSE = '</diffpi-planner-escalation>';

export function renderPlannerEscalation(value: PlannerEscalation): string {
  return `${OPEN}${JSON.stringify(escalationSchema.parse(value))}${CLOSE}`;
}

export function parsePlannerEscalation(output: string): PlannerEscalation {
  const start = output.indexOf(OPEN);
  const end = output.indexOf(CLOSE, start + OPEN.length);
  if (start < 0 || end < 0 || output.indexOf(OPEN, start + OPEN.length) >= 0)
    throw new Error('Missing or ambiguous planner escalation payload.');
  const payload = output.slice(start + OPEN.length, end);
  try {
    return escalationSchema.parse(JSON.parse(payload));
  } catch (error) {
    throw new Error(`Malformed planner escalation payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}
