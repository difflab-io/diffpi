import { z } from 'zod';
import { zx } from '../extensions/zodx';

const planStatusSchema = z.enum(['draft', 'ready', 'in_progress', 'blocked', 'completed']);
const planUnitStatusSchema = z.enum(['draft', 'ready', 'in_progress', 'blocked', 'completed', 'pending', 'skipped']);

export const planTaskDraftSchema = z
  .object({
    id: zx.id,
    title: zx.text,
    steps: z.array(zx.text).optional(),
    dependencies: z.array(zx.id).optional(),
    fileScopes: z.array(zx.text).optional(),
    acceptanceCriteria: z.array(zx.text).optional(),
  })
  .strict();

export const planPhaseDraftSchema = z
  .object({
    id: zx.id,
    title: zx.text,
    objective: zx.text,
    dependencies: z.array(zx.id).optional(),
    tasks: z.array(planTaskDraftSchema).optional(),
  })
  .strict();

export const planReferenceSchema = z.object({ id: zx.id, value: zx.text }).strict();

export const planDesignSchema = z
  .object({
    bigIdeas: z.string(),
    keyApiUpdates: z.string(),
    consequences: z.string(),
  })
  .strict();

export const planContextParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: z.string().optional(),
    branch: z.string().optional(),
    statuses: z.array(planStatusSchema).optional(),
  })
  .strict();

export const planInitParametersSchema = z
  .object({
    cwd: zx.cwd,
    shortSlug: zx.id,
    branch: z.string().min(1).optional(),
    title: zx.text.optional(),
    intent: zx.text.optional(),
    issueId: zx.text.optional(),
    issueUrl: z.string().url().optional(),
    open: z.boolean().optional(),
  })
  .strict();

export const planUpdateOverviewParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    expectedPlanRevision: zx.revision,
    intent: zx.text.optional(),
    requirements: z.array(zx.text).optional(),
    design: planDesignSchema.optional(),
    references: z.array(planReferenceSchema).optional(),
  })
  .strict()
  .refine((value) => value.intent || value.requirements || value.design || value.references, {
    message: 'At least one overview field is required.',
  });

export const planAddPhaseParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    expectedPlanRevision: zx.revision,
    afterPhaseId: zx.id.optional(),
    phase: planPhaseDraftSchema,
  })
  .strict();

export const planRemovePhaseParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    expectedPlanRevision: zx.revision,
    phaseId: zx.id,
    reason: zx.text,
  })
  .strict();

export const planUpdatePhaseParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    expectedPlanRevision: zx.revision,
    phaseId: zx.id,
    patch: z
      .object({
        title: zx.text.optional(),
        objective: zx.text.optional(),
        dependencies: z.array(zx.id).optional(),
        tasks: z.array(planTaskDraftSchema).optional(),
      })
      .strict(),
  })
  .strict();

export const planValidateParametersSchema = z
  .object({ cwd: zx.cwd, plan: zx.text, strict: z.boolean().optional() })
  .strict();

export const planLogProgressParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    actor: zx.text,
    message: zx.text,
    executionId: zx.id.optional(),
    phaseId: zx.id.optional(),
    taskId: zx.id.optional(),
    evidence: z.array(zx.text).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const planRunGatesParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    phaseId: zx.id,
    expectedPhaseRevision: zx.revision,
    executionId: zx.id,
    actor: zx.text,
  })
  .strict();

export const planWatchCiParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    phaseId: zx.id,
    sha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i),
    executionId: zx.id,
    actor: zx.text,
    retryFailed: z.boolean().default(false),
    retryReason: zx.text.optional(),
    timeoutSeconds: z.number().int().min(30).max(7_200).default(1_800),
    pollSeconds: z.number().int().min(2).max(60).default(10),
  })
  .strict()
  .refine((value) => !value.retryFailed || value.retryReason, {
    message: 'A retry reason is required when retryFailed is true.',
    path: ['retryReason'],
  });

export const planLookupParametersSchema = z.object({ cwd: zx.cwd, plan: z.string().optional() }).strict();

export const planStartExecutionParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    commitMode: z.enum(['no-commit', 'commit', 'push']),
    actor: zx.text,
  })
  .strict();

export const planUpdateStatusParametersSchema = z
  .object({
    cwd: zx.cwd,
    plan: zx.text,
    target: z
      .object({ type: z.enum(['plan', 'phase', 'task']), id: zx.id.optional() })
      .strict()
      .refine((value) => value.type === 'plan' || value.id, 'Phase and task targets require an ID.'),
    expectedStatus: planUnitStatusSchema,
    status: planUnitStatusSchema,
    actor: zx.text,
    message: zx.text,
    executionId: zx.id.optional(),
    evidence: z.array(zx.text).optional(),
    blockedReason: zx.text.optional(),
    attempts: z.array(zx.text).optional(),
    needsUserDecision: z.boolean().optional(),
    commit: z
      .object({
        sha: z.string().regex(/^[a-f0-9]{7,64}$/i),
        subject: zx.text,
        completedAt: z.string().datetime(),
        pushedAt: z.string().datetime().optional(),
        ci: z
          .object({ status: z.literal('pending'), startedAt: z.string().datetime() })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type PlanTaskDraft = z.infer<typeof planTaskDraftSchema>;
export type PlanPhaseDraft = z.infer<typeof planPhaseDraftSchema>;

export const planAnnotationCommentSchema = z
  .object({
    id: z.string(),
    content: z.string(),
    path: z.string().optional(),
    start_line: z.number().int().optional(),
    line: z.number().int().optional(),
    end_line: z.number().int().optional(),
  })
  .loose();
