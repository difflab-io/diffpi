import type { ExtensionAPI, ExtensionContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { join } from 'node:path';
import { launchBackgroundAgent } from '../extensions/subagentx';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { resolveBundledAgentsDir } from '../assets';
import { detectVcs, diffpiLaunchName, openInNewTab } from '../environment';
import { runMiseGates } from '../gates';
import type { ModeController } from '../modes';
import {
  createPlanController,
  type PlanDesign,
  type PlanDocument,
  type PlanPhase,
  type PlanReference,
  type PlanController,
  type PlanTask,
} from '../plan';
import { run, runChecked } from '../extensions/processx';
import { createVcsBackend } from '../vcs';

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = z.string().trim().min(1);
const revision = z.number().int().nonnegative();
const cwd = z.string().optional();
const taskDraft = z
  .object({
    id,
    title: text,
    steps: z.array(text).optional(),
    dependencies: z.array(id).optional(),
    fileScopes: z.array(text).optional(),
    acceptanceCriteria: z.array(text).optional(),
  })
  .strict();
const phaseDraft = z
  .object({
    id,
    title: text,
    objective: text,
    dependencies: z.array(id).optional(),
    tasks: z.array(taskDraft).optional(),
  })
  .strict();
const reference = z.object({ id, value: text }).strict();
const design = z.object({ bigIdeas: z.string(), keyApiUpdates: z.string(), consequences: z.string() }).strict();
export type PlanToolRuntime = Pick<ExtensionAPI, 'events' | 'sendUserMessage'> &
  Partial<Pick<ExtensionAPI, 'sendMessage'>>;

export function createPlanTools(
  pi: PlanToolRuntime,
  modes: ModeController,
  store: PlanController = createPlanController(),
): readonly ToolDefinition[] {
  return [
    defineTool({
      name: 'plan_context',
      label: 'plan context',
      description: 'Resolve one plan and summarize all matching plans without guessing among ambiguous matches.',
      parameters: parameters(
        z
          .object({
            cwd,
            plan: z.string().optional(),
            branch: z.string().optional(),
            statuses: z.array(z.enum(['draft', 'ready', 'in_progress', 'blocked', 'completed'])).optional(),
          })
          .strict(),
      ),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = z
          .object({
            cwd,
            plan: z.string().optional(),
            branch: z.string().optional(),
            statuses: z.array(z.enum(['draft', 'ready', 'in_progress', 'blocked', 'completed'])).optional(),
          })
          .strict()
          .parse(input);
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
      parameters: parameters(
        z
          .object({
            cwd,
            shortSlug: id,
            branch: z.string().min(1).optional(),
            title: text.optional(),
            intent: text.optional(),
            open: z.boolean().optional(),
          })
          .strict(),
      ),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z
          .object({
            cwd,
            shortSlug: id,
            branch: z.string().min(1).optional(),
            title: text.optional(),
            intent: text.optional(),
            open: z.boolean().optional(),
          })
          .strict()
          .parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const branch = params.branch ?? (await currentBranch(workingDirectory));
        const record = await store.create({ ...params, cwd: workingDirectory, branch });
        return result(`Created ${record.id} at ${record.planPath}.`, { record, openRequested: params.open === true });
      },
    }),
    defineTool({
      name: 'plan_update_overview',
      label: 'plan update overview',
      description: 'Replace selected plan overview fields using an expected plan revision.',
      parameters: parameters(
        z
          .object({
            cwd,
            plan: text,
            expectedPlanRevision: revision,
            intent: text.optional(),
            requirements: z.array(text).optional(),
            design: design.optional(),
            references: z.array(reference).optional(),
          })
          .strict()
          .refine(
            (value) => value.intent || value.requirements || value.design || value.references,
            'At least one overview field is required.',
          ),
      ),
      executionMode: 'sequential',
      async execute(_id, input) {
        const schema = z
          .object({
            cwd,
            plan: text,
            expectedPlanRevision: revision,
            intent: text.optional(),
            requirements: z.array(text).optional(),
            design: design.optional(),
            references: z.array(reference).optional(),
          })
          .strict()
          .refine(
            (value) => value.intent || value.requirements || value.design || value.references,
            'At least one overview field is required.',
          );
        const params = schema.parse(input);
        const record = await store.update(params.cwd ?? process.cwd(), params.plan, 'update overview', (plan) => {
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
      parameters: parameters(
        z
          .object({ cwd, plan: text, expectedPlanRevision: revision, afterPhaseId: id.optional(), phase: phaseDraft })
          .strict(),
      ),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z
          .object({ cwd, plan: text, expectedPlanRevision: revision, afterPhaseId: id.optional(), phase: phaseDraft })
          .strict()
          .parse(input);
        const record = await store.update(params.cwd ?? process.cwd(), params.plan, 'add phase', (plan) => {
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
          assertNewIds(store, plan, phase);
          return resetDraft({ ...plan, phases });
        });
        return result(`Added phase ${params.phase.id} to ${record.id}.`, { record });
      },
    }),
    defineTool({
      name: 'plan_remove_phase',
      label: 'plan remove phase',
      description: 'Remove an unfinished phase that has no dependents.',
      parameters: parameters(
        z.object({ cwd, plan: text, expectedPlanRevision: revision, phaseId: id, reason: text }).strict(),
      ),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z
          .object({ cwd, plan: text, expectedPlanRevision: revision, phaseId: id, reason: text })
          .strict()
          .parse(input);
        const record = await store.update(params.cwd ?? process.cwd(), params.plan, 'remove phase', (plan) => {
          assertAuthoringRevision(plan, params.expectedPlanRevision);
          assertAuthorable(plan);
          const phase = getPhase(plan, params.phaseId);
          if (phase.status === 'completed' || phase.tasks.some((task) => task.status === 'completed'))
            throw new Error(`Completed phase ${phase.id} cannot be removed.`);
          if (plan.phases.some((item) => item.dependencies.includes(phase.id)))
            throw new Error(`Phase ${phase.id} has dependents and cannot be removed.`);
          return resetDraft({ ...plan, phases: plan.phases.filter((item) => item.id !== phase.id) });
        });
        await store.appendLog(params.cwd ?? process.cwd(), record.id, {
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
      parameters: parameters(
        z
          .object({
            cwd,
            plan: text,
            expectedPlanRevision: revision,
            phaseId: id,
            patch: z
              .object({
                title: text.optional(),
                objective: text.optional(),
                dependencies: z.array(id).optional(),
                tasks: z.array(taskDraft).optional(),
              })
              .strict(),
          })
          .strict(),
      ),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z
          .object({
            cwd,
            plan: text,
            expectedPlanRevision: revision,
            phaseId: id,
            patch: z
              .object({
                title: text.optional(),
                objective: text.optional(),
                dependencies: z.array(id).optional(),
                tasks: z.array(taskDraft).optional(),
              })
              .strict(),
          })
          .strict()
          .parse(input);
        const record = await store.update(params.cwd ?? process.cwd(), params.plan, 'update phase', (plan) => {
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
          assertNewIds(store, { ...plan, phases: plan.phases.filter((phase) => phase.id !== existing.id) }, updated);
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
      description: 'Validate plan markers, dependencies, completeness, annotations, and Design length.',
      parameters: parameters(z.object({ cwd, plan: text, strict: z.boolean().optional() }).strict()),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = z.object({ cwd, plan: text, strict: z.boolean().optional() }).strict().parse(input);
        const record = await store.read(params.cwd ?? process.cwd(), params.plan);
        const annotations = params.strict ? await store.annotations(record) : { pending: [] };
        const issues = store.validate(record.document, {
          strict: params.strict,
          pendingAnnotations: annotations.pending.length,
        });
        const words = store.countDesignWords(record.document);
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
      parameters: parameters(
        z
          .object({
            cwd,
            plan: text,
            actor: text,
            message: text,
            executionId: id.optional(),
            phaseId: id.optional(),
            taskId: id.optional(),
            evidence: z.array(text).optional(),
            data: z.record(z.string(), z.unknown()).optional(),
          })
          .strict(),
      ),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z
          .object({
            cwd,
            plan: text,
            actor: text,
            message: text,
            executionId: id.optional(),
            phaseId: id.optional(),
            taskId: id.optional(),
            evidence: z.array(text).optional(),
            data: z.record(z.string(), z.unknown()).optional(),
          })
          .strict()
          .parse(input);
        const record = await store.read(params.cwd ?? process.cwd(), params.plan);
        const entry = await store.appendLog(params.cwd ?? process.cwd(), params.plan, {
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
    createStatusTool(pi, modes, store),
    defineTool({
      name: 'plan_run_gates',
      label: 'plan run gates',
      description: 'Run format check, lint, and tests without holding the plan lock, then persist non-stale results.',
      parameters: parameters(
        z
          .object({ cwd, plan: text, phaseId: id, expectedPhaseRevision: revision, executionId: id, actor: text })
          .strict(),
      ),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z
          .object({ cwd, plan: text, phaseId: id, expectedPhaseRevision: revision, executionId: id, actor: text })
          .strict()
          .parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const before = await store.read(workingDirectory, params.plan);
        const phase = getPhase(before.document, params.phaseId);
        if (phase.revision !== params.expectedPhaseRevision) throw new Error(`Stale phase revision for ${phase.id}.`);
        store.assertPhasePushEligible(before.document, phase.id, params.executionId);
        if (!before.document.execution?.active || before.document.execution.id !== params.executionId)
          throw new Error(`Execution ${params.executionId} does not own this plan.`);
        if (phase.tasks.some((task) => task.status !== 'completed' && task.status !== 'skipped'))
          throw new Error(`Phase ${phase.id} still has incomplete tasks.`);
        const results = await runMiseGates(workingDirectory);
        const passed = results.every((gate) => gate.status === 'pass' || gate.status === 'skip');
        const record = await store.update(workingDirectory, params.plan, 'persist gates', (plan) => {
          const current = getPhase(plan, params.phaseId);
          if (current.revision !== params.expectedPhaseRevision)
            throw new Error(`Gate results for ${current.id} are stale.`);
          store.assertPhasePushEligible(plan, current.id, params.executionId);
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
        await store.appendLog(workingDirectory, record.id, {
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
      name: 'plan_watch_ci',
      label: 'plan watch CI',
      description:
        'Wait for hosted CI on one pushed phase commit and persist the settled result. Failed CI requires retryFailed=true with a retryReason.',
      parameters: parameters(
        z
          .object({
            cwd,
            plan: text,
            phaseId: id,
            sha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i),
            executionId: id,
            actor: text,
            retryFailed: z.boolean().default(false),
            retryReason: text.optional(),
            timeoutSeconds: z.number().int().min(30).max(7_200).default(1_800),
            pollSeconds: z.number().int().min(2).max(60).default(10),
          })
          .strict()
          .refine((value) => !value.retryFailed || value.retryReason, {
            message: 'A retry reason is required when retryFailed is true.',
            path: ['retryReason'],
          }),
      ),
      executionMode: 'sequential',
      async execute(_id, input, signal) {
        const params = z
          .object({
            cwd,
            plan: text,
            phaseId: id,
            sha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i),
            executionId: id,
            actor: text,
            retryFailed: z.boolean().default(false),
            retryReason: text.optional(),
            timeoutSeconds: z.number().int().min(30).max(7_200).default(1_800),
            pollSeconds: z.number().int().min(2).max(60).default(10),
          })
          .strict()
          .refine((value) => !value.retryFailed || value.retryReason, {
            message: 'A retry reason is required when retryFailed is true.',
            path: ['retryReason'],
          })
          .parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const before = await store.read(workingDirectory, params.plan);
        const phase = getPhase(before.document, params.phaseId);
        if (!before.document.execution?.active || before.document.execution.id !== params.executionId)
          throw new Error(`Execution ${params.executionId} does not own this plan.`);
        if (phase.commit?.sha !== params.sha) throw new Error(`Phase ${phase.id} is not committed at ${params.sha}.`);
        if (phase.commit.ci?.status === 'failed') {
          if (!params.retryFailed) throw new Error(`CI for phase ${phase.id} failed; request an audited retry.`);
          if (!params.retryReason) throw new Error('A retry reason is required for an audited CI retry.');
          await store.retryCi(workingDirectory, params.plan, {
            phaseId: params.phaseId,
            sha: params.sha,
            actor: params.actor,
            executionId: params.executionId,
            reason: params.retryReason,
          });
        } else {
          if (params.retryFailed) throw new Error(`CI for phase ${phase.id} can retry only after failure.`);
          if (phase.commit.ci?.status !== 'pending')
            throw new Error(`CI for phase ${phase.id} is already ${phase.commit.ci?.status ?? 'untracked'}.`);
        }
        const settled = await watchPlanCi(
          {
            cwd: workingDirectory,
            sha: params.sha,
            timeoutSeconds: params.timeoutSeconds,
            pollSeconds: params.pollSeconds,
          },
          signal,
        );
        const record = await store.updateCi(workingDirectory, params.plan, {
          phaseId: params.phaseId,
          sha: params.sha,
          status: settled.status,
          actor: params.actor,
          executionId: params.executionId,
          detail: settled.detail,
        });
        return result(`CI ${settled.status} for ${params.phaseId}: ${settled.detail}`, { settled, record });
      },
    }),
    defineTool({
      name: 'plan_annotate',
      label: 'plan annotate',
      description: 'Launch the selected PLAN.md in tuicr standalone file annotation mode.',
      parameters: parameters(z.object({ cwd, plan: z.string().optional() }).strict()),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z.object({ cwd, plan: z.string().optional() }).strict().parse(input);
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
            ? `Opened ${resolution.record.id} for annotation.`
            : (launched.instruction ?? `Run: ${fallbackCommand}`),
          { record: resolution.record, launched, fallbackCommand, followUp: `/plan update ${resolution.record.id}` },
        );
      },
    }),
    defineTool({
      name: 'plan_annotations',
      label: 'plan annotations',
      description: 'Read normalized pending comments from the selected plan annotation session.',
      parameters: parameters(
        z.object({ cwd, plan: z.string().optional(), includeApplied: z.boolean().optional() }).strict(),
      ),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = z
          .object({ cwd, plan: z.string().optional(), includeApplied: z.boolean().optional() })
          .strict()
          .parse(input);
        const workingDirectory = params.cwd ?? process.cwd();
        const resolution = await store.context(workingDirectory, params.plan);
        if (!resolution.record)
          throw new Error(
            resolution.ambiguous
              ? `Plan is ambiguous: ${resolution.candidates.map((item) => item.id).join(', ')}.`
              : 'No matching plan.',
          );
        const annotations = await store.annotations(resolution.record, { includeApplied: params.includeApplied });
        return result(
          annotations.comments.length
            ? annotations.comments.map((comment) => `${comment.id}: ${comment.body}`).join('\n')
            : 'No pending annotations.',
          { record: resolution.record, ...annotations },
        );
      },
    }),
    defineTool({
      name: 'plan_ack_annotations',
      label: 'plan acknowledge annotations',
      description: 'Acknowledge only annotation comments successfully applied to the plan.',
      parameters: parameters(z.object({ cwd, plan: text, commentIds: z.array(text).min(1), summary: text }).strict()),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = z
          .object({ cwd, plan: text, commentIds: z.array(text).min(1), summary: text })
          .strict()
          .parse(input);
        const record = await store.read(params.cwd ?? process.cwd(), params.plan);
        const state = await store.acknowledgeAnnotations(record, params.commentIds, params.summary);
        return result(`Acknowledged ${params.commentIds.length} annotations for ${record.id}.`, {
          record,
          state,
          acknowledged: params.commentIds,
        });
      },
    }),
    defineTool({
      name: 'plan_start_execution',
      label: 'plan start execution',
      description: 'Start one inline or background plan execution.',
      parameters: parameters(
        z
          .object({
            cwd,
            plan: text,
            mode: z.enum(['inline', 'background']),
            policy: z.enum(['commit-per-phase', 'no-commit']),
            actor: text,
            coordinator: z.enum(['spawn', 'current']).optional(),
          })
          .strict(),
      ),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = z
          .object({
            cwd,
            plan: text,
            mode: z.enum(['inline', 'background']),
            policy: z.enum(['commit-per-phase', 'no-commit']),
            actor: text,
            coordinator: z.enum(['spawn', 'current']).optional(),
          })
          .strict()
          .parse(input);
        return startExecution(pi, modes, store, params, ctx);
      },
    }),
  ];
}

function createStatusTool(pi: PlanToolRuntime, modes: ModeController, store: PlanController): ToolDefinition {
  const schema = z
    .object({
      cwd,
      plan: text,
      target: z
        .object({ type: z.enum(['plan', 'phase', 'task']), id: id.optional() })
        .strict()
        .refine((value) => value.type === 'plan' || value.id, 'Phase and task targets require an ID.'),
      expectedStatus: z.enum(['draft', 'ready', 'in_progress', 'blocked', 'completed', 'pending', 'skipped']),
      status: z.enum(['draft', 'ready', 'in_progress', 'blocked', 'completed', 'pending', 'skipped']),
      actor: text,
      message: text,
      executionId: id.optional(),
      evidence: z.array(text).optional(),
      blockedReason: text.optional(),
      attempts: z.array(text).optional(),
      needsUserDecision: z.boolean().optional(),
      commit: z
        .object({
          sha: z.string().regex(/^[a-f0-9]{7,64}$/i),
          subject: text,
          completedAt: z.string().datetime(),
          pushedAt: z.string().datetime(),
          ci: z.object({ status: z.literal('pending'), startedAt: z.string().datetime() }).strict(),
        })
        .strict()
        .optional(),
    })
    .strict();
  return defineTool({
    name: 'plan_update_status',
    label: 'plan update status',
    description: 'Apply an ownership-checked plan, phase, or task status transition and append an audit event.',
    parameters: parameters(schema),
    executionMode: 'sequential',
    async execute(_id, input, _signal, _onUpdate, ctx) {
      const params = schema.parse(input);
      const workingDirectory = params.cwd ?? process.cwd();
      if (params.commit) {
        if (params.target.type !== 'phase' || params.status !== 'completed')
          throw new Error('Commit metadata is accepted only when completing a phase.');
        const verified = await verifyCommit(workingDirectory, params.commit.sha);
        if (verified.sha !== params.commit.sha && !verified.sha.startsWith(params.commit.sha))
          throw new Error(`Commit ${params.commit.sha} is not the current HEAD ${verified.sha}.`);
        if (verified.subject !== params.commit.subject)
          throw new Error(`Commit subject does not match HEAD: ${verified.subject}.`);
        await verifyPushedCommit(workingDirectory, verified.sha);
        params.commit.sha = verified.sha;
      }
      const { record, escalation } = await store.updateStatus(workingDirectory, params.plan, params);
      if (escalation && record.document.execution?.mode !== 'background') {
        const selected = await modes.set('planner', ctx as ExtensionContext);
        if (selected.ok)
          pi.sendUserMessage(store.renderEscalation(escalation), {
            deliverAs: 'followUp',
          });
      }
      const completedInlineExecution =
        params.target.type === 'plan' && params.status === 'completed' && record.document.execution?.mode === 'inline';
      const modeReset = completedInlineExecution ? await modes.unset(ctx as ExtensionContext) : undefined;
      const summary = modeReset?.ok
        ? `Updated ${params.target.type} to ${params.status} and restored the default inline mode.`
        : `Updated ${params.target.type} to ${params.status}.`;
      return result(summary, {
        record,
        escalation,
        foregroundModeChanged: modeReset?.ok ?? false,
        modeReset,
      });
    },
  });
}

async function startExecution(
  pi: PlanToolRuntime,
  modes: ModeController,
  store: PlanController,
  params: {
    cwd?: string;
    plan: string;
    mode: 'inline' | 'background';
    policy: 'commit-per-phase' | 'no-commit';
    actor: string;
    coordinator?: 'spawn' | 'current';
  },
  ctx: ExtensionContext,
) {
  const workingDirectory = params.cwd ?? process.cwd();
  const coordinator = params.coordinator ?? 'spawn';
  if (coordinator === 'current' && params.mode !== 'background')
    throw new Error('Coordinator current is valid only for background execution.');
  const before = await store.read(workingDirectory, params.plan);
  if (before.document.execution?.active) throw new Error(`Plan ${before.id} already has an active execution.`);
  if (before.document.status !== 'ready' && before.document.status !== 'blocked')
    throw new Error(`Plan ${before.id} must be ready or blocked before execution.`);
  const branch = await currentBranch(workingDirectory);
  if (branch !== before.document.branch)
    throw new Error(`Plan branch is ${before.document.branch}; current branch is ${branch}.`);
  if (params.policy === 'commit-per-phase') {
    const dirty = await runChecked('git', ['-C', workingDirectory, 'status', '--porcelain']);
    if (dirty.stdout.trim()) throw new Error(`Commit-per-phase requires a clean worktree:\n${dirty.stdout.trim()}`);
  }
  const head = (await runChecked('git', ['-C', workingDirectory, 'rev-parse', 'HEAD'])).stdout.trim();
  const executionId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const record = await store.update(workingDirectory, before.id, 'start execution', (plan) => {
    if (plan.execution?.active) throw new Error(`Plan ${plan.id} already has an active execution.`);
    if (plan.status !== 'ready' && plan.status !== 'blocked')
      throw new Error(`Plan ${plan.id} must be ready or blocked before execution.`);
    if (plan.branch !== branch) throw new Error(`Plan branch is ${plan.branch}; current branch is ${branch}.`);
    if (params.policy === 'no-commit' && plan.phases.some((phase) => phase.commit))
      throw new Error('A plan with recorded phase commits cannot restart with no-commit policy.');
    return {
      ...plan,
      status: 'in_progress',
      execution: {
        id: executionId,
        mode: params.mode,
        policy: params.policy,
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
  let inlineModeSelected = false;
  try {
    await store.appendLog(workingDirectory, record.id, {
      planRevision: record.document.revision,
      kind: 'execution',
      actor: params.actor,
      message: `Started ${params.mode} execution ${executionId}.`,
      executionId,
    });
    const executionCoordinator = params.mode === 'inline' ? 'worker' : 'orchestrator';
    const prompt = store.executionPrompt(store.executionPacket(record.document, executionCoordinator));
    if (params.mode === 'background' && coordinator === 'current') {
      return result(`Started ${params.mode} execution ${executionId}. Continue as the current coordinator.`, {
        record,
        executionId,
        prompt,
        dispatched: false,
        queued: false,
        foregroundModeChanged: false,
      });
    }
    if (params.mode === 'inline') {
      const selected = await modes.set('worker', ctx);
      if (!selected.ok) throw new Error(selected.message);
      inlineModeSelected = true;
      if (!pi.sendMessage) throw new Error('Inline execution dispatch is unavailable.');
      pi.sendMessage(
        { customType: 'diffpi-plan-execution', display: false, content: prompt },
        { triggerTurn: true, deliverAs: 'followUp' },
      );
    } else {
      await launchBackgroundAgent(pi.events, {
        name: `Plan go ${record.id}`,
        agent: 'orchestrator',
        cwd: workingDirectory,
        inheritContext: false,
        prompt,
      });
    }
    return result(`Started ${params.mode} execution ${executionId}.`, {
      record,
      executionId,
      dispatched: true,
      queued: true,
      foregroundModeChanged: params.mode === 'inline',
    });
  } catch (error) {
    const message = `${params.mode === 'inline' ? 'Inline' : 'Background'} execution dispatch failed: ${(error as Error).message}`;
    if (inlineModeSelected) await modes.unset(ctx).catch(() => undefined);
    const compensated = await store.update(workingDirectory, record.id, 'compensate dispatch failure', (plan) => {
      if (!plan.execution?.active || plan.execution.id !== executionId) return plan;
      return {
        ...plan,
        status: 'blocked',
        execution: { ...plan.execution, active: false, heartbeatAt: new Date().toISOString() },
      };
    });
    await store.appendLog(workingDirectory, compensated.id, {
      planRevision: compensated.document.revision,
      kind: 'blocker',
      actor: params.actor,
      message,
      executionId,
    });
    throw new Error(`${message} Plan ${compensated.id} is blocked and inactive.`);
  }
}

function newPhase(input: z.infer<typeof phaseDraft>): PlanPhase {
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

function newTask(input: z.infer<typeof taskDraft>): PlanTask {
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

function reconcileTasks(existing: readonly PlanTask[], drafts: readonly z.infer<typeof taskDraft>[]): PlanTask[] {
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

function assertNewIds(store: PlanController, plan: PlanDocument, phase: PlanPhase): void {
  const known = allIds(plan);
  for (const candidate of [phase.id, ...phase.tasks.map((task) => task.id)]) {
    store.assertStableId(candidate);
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

async function watchPlanCi(
  options: { cwd: string; sha: string; timeoutSeconds: number; pollSeconds: number },
  signal?: AbortSignal,
): Promise<{ status: 'passed' | 'failed' | 'skipped'; detail: string }> {
  const vcs = await detectVcs(options.cwd);
  if (vcs.provider === 'none') return { status: 'skipped', detail: 'No supported remote CI provider.' };
  const forge = createVcsBackend(vcs);
  const timeoutSignal = AbortSignal.timeout(options.timeoutSeconds * 1_000);
  const watchSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  try {
    const settled = await forge.watchCommitCi(options.sha, {
      intervalSeconds: options.pollSeconds,
      signal: watchSignal,
    });
    if (settled.status === 'pending')
      return {
        status: 'failed',
        detail: `CI did not settle within ${options.timeoutSeconds} seconds for ${options.sha}.`,
      };
    return { status: settled.status, detail: settled.detail };
  } catch (error) {
    if (signal?.aborted) throw new Error('CI monitoring was cancelled.', { cause: error });
    if (timeoutSignal.aborted)
      return {
        status: 'failed',
        detail: `CI did not settle within ${options.timeoutSeconds} seconds for ${options.sha}.`,
      };
    throw error;
  }
}

function parameters(schema: z.ZodTypeAny): ToolDefinition['parameters'] {
  return z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'];
}

function result(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}
