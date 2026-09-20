import { assertPhaseTransition, assertPlanTransition, assertStableId, assertTaskTransition } from './transitions';
import { createPlanStore, type PlanStore, type PlanStoreOptions } from './store';
import { validatePlanDocument } from './markdown';
import type {
  PlanDocument,
  PlanPhaseStatus,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  PlanValidationIssue,
  PlanValidationOptions,
} from './types';

export interface PlanController extends PlanStore {
  validate(document: PlanDocument, options?: PlanValidationOptions): PlanValidationIssue[];
  assertStableId(value: string, label?: string): void;
  assertPlanTransition(from: PlanStatus, to: PlanStatus): void;
  assertPhaseTransition(from: PlanPhaseStatus, to: PlanPhaseStatus): void;
  assertTaskTransition(task: PlanTask, to: PlanTaskStatus, executionId?: string, actor?: string): void;
}

export function createPlanController(options: PlanStoreOptions = {}): PlanController {
  return {
    ...createPlanStore(options),
    validate: validatePlanDocument,
    assertStableId,
    assertPlanTransition,
    assertPhaseTransition,
    assertTaskTransition,
  };
}
