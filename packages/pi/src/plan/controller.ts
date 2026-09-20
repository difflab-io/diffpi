import {
  acknowledgePlanAnnotations,
  annotatePlan,
  readPlanAnnotations,
  type PlanAnnotationRuntime,
} from './annotations';
import { createExecutionPacket, renderExecutionPrompt, type PlanExecutionPacket } from './execution';
import { countDesignWords, validatePlanDocument } from './markdown';
import { createPlanStore, type PlanStore, type PlanStoreOptions } from './store';
import { assertPhaseTransition, assertPlanTransition, assertStableId, assertTaskTransition } from './transitions';
import { renderPlannerEscalation } from './escalation';
import type {
  PlanDocument,
  PlanPhaseStatus,
  PlanRecord,
  PlanStatus,
  PlanTask,
  PlanTaskStatus,
  PlanValidationIssue,
  PlanValidationOptions,
  PlannerEscalation,
} from './types';

export interface PlanController extends PlanStore {
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
  renderEscalation(escalation: PlannerEscalation): string;
  assertStableId(value: string, label?: string): void;
  assertPlanTransition(from: PlanStatus, to: PlanStatus): void;
  assertPhaseTransition(from: PlanPhaseStatus, to: PlanPhaseStatus): void;
  assertTaskTransition(task: PlanTask, to: PlanTaskStatus, executionId?: string, actor?: string): void;
}

export function createPlanController(options: PlanStoreOptions = {}): PlanController {
  return {
    ...createPlanStore(options),
    validate: validatePlanDocument,
    countDesignWords,
    annotate: annotatePlan,
    annotations: readPlanAnnotations,
    acknowledgeAnnotations: acknowledgePlanAnnotations,
    executionPacket: createExecutionPacket,
    executionPrompt: renderExecutionPrompt,
    renderEscalation: renderPlannerEscalation,
    assertStableId,
    assertPlanTransition,
    assertPhaseTransition,
    assertTaskTransition,
  };
}
