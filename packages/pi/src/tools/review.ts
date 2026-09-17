import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTool, type ExtensionContext, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { detectIde, detectMux, detectShell, detectVcs, type VcsInfo } from '../environment';
import { createForge, type Forge, type PrRef } from '../forge';
import { checkConventionalSubject, ciGate, runMiseGates, type GateResult } from '../gates';
import { run, runChecked } from '../process';
import { assertReviewEventSupported, createLocalReviewBackend, createRemoteReviewBackend } from '../review-backend';
import {
  loadReviewPublicationState,
  reviewCommentFingerprint,
  reviewReplyFingerprint,
  saveReviewPublicationState,
  unpublishedReviewComments,
} from '../review-publication';
import type { ReviewBackend, ReviewComment } from '../review-types';
import {
  dedupeFindings,
  findingsSchema,
  localReviewAuthor,
  parseThreadArtifact,
  renderReviewDoc,
  renderThreadArtifact,
  reviewRecordName,
  reviewSlug,
  toReviewComments,
  withRemoteProvenance,
  type Finding,
  type ReviewThreadRecord,
} from '../review';
import { ensureStore, reviewsDir } from '../store';
import { loadTemplate, renderTemplate } from '../templates';
import { launch, readSession, resolveReviewSession, toFindings } from '../tuicr';

// Schemas ---------------------------------------------------------------------

const contextSchema = z.object({
  cwd: z.string().optional(),
  target: z.string().optional(),
  workingTree: z.boolean().optional(),
});
const localSchema = contextSchema.extend({ local: z.boolean().optional() });
const openSchema = localSchema.extend({
  title: z.string().optional(),
  intent: z.string().optional(),
  base: z.string().optional(),
});
const submitSchema = localSchema.extend({
  findings: findingsSchema,
  overallIssues: z.array(z.string()).optional(),
  notVerified: z.array(z.string()).optional(),
  title: z.string().optional(),
});
const addCommentSchema = localSchema.extend({
  body: z.string().min(1),
  file: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(['LEFT', 'RIGHT']).optional(),
});
const respondSchema = localSchema.extend({
  threadId: z.string().min(1),
  body: z.string().min(1),
  question: z.boolean().optional(),
  resolve: z.boolean().optional(),
});
const publishSchema = localSchema.extend({
  status: z.enum(['COMMENT', 'APPROVE', 'REQUEST_CHANGES', 'CLOSE']).optional(),
});

type CwdParams = { cwd?: string };
type ReviewContext = {
  cwd: string;
  vcs: VcsInfo;
  forge?: Forge;
  pr?: PrRef;
};
type RemoteReviewContext = ReviewContext & { forge: Forge; pr: PrRef };
type PublishParams = z.infer<typeof publishSchema>;
type Publication = Awaited<ReturnType<typeof loadReviewPublicationState>>;
type LocalPromotion = {
  publication: Publication;
  commentFingerprints: string[];
  promotedComments: number;
  promotedReplies: number;
};

// Tool helpers ----------------------------------------------------------------

function parameters(schema: z.ZodTypeAny): ToolDefinition['parameters'] {
  return z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'];
}

function cwdOf(params: CwdParams): string {
  return params.cwd ?? process.cwd();
}

function result(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

function modelRoute(ctx: ExtensionContext): string {
  if (!ctx.model) throw new Error('Cannot record review provenance because Pi did not provide an active model route.');
  return `${ctx.model.provider}/${ctx.model.id}`;
}

export function conventionalMergeGuard(subject: string): GateResult {
  return checkConventionalSubject(subject);
}

export async function workingTreeDiff(cwd: string): Promise<string> {
  const tracked = await run('git', ['-C', cwd, 'diff', 'HEAD'], { capture: 'unbounded' });
  if (tracked.code !== 0) throw new Error(tracked.stderr || 'Cannot read tracked working-tree changes.');
  const untracked = await runChecked('git', ['-C', cwd, 'ls-files', '--others', '--exclude-standard', '-z']);
  const patches = [tracked.stdout];
  for (const file of untracked.stdout.split('\0').filter(Boolean)) {
    const patch = await run('git', ['-C', cwd, 'diff', '--no-index', '--', '/dev/null', file], {
      capture: 'unbounded',
    });
    if (patch.code > 1) throw new Error(patch.stderr || `Cannot read untracked file diff: ${file}`);
    patches.push(patch.stdout);
  }
  return patches.filter(Boolean).join('\n');
}

export { assertGitHubMergeReady } from '../forge';

// Catalog ---------------------------------------------------------------------

export function createReviewTools(): readonly ToolDefinition[] {
  return [
    defineTool({
      name: 'review_context',
      label: 'review context',
      description: 'Orient to the target, backend, forge, environment, shared store, PR/MR, and tuicr session.',
      promptSnippet: 'Call review_context first',
      promptGuidelines: ['Call this before every review workflow.'],
      parameters: parameters(localSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        const store = await ensureStore(review.cwd);
        const env = { ide: detectIde(), mux: detectMux(), shell: detectShell() };
        const session = await resolveTuicrSession(review, params.workingTree);
        const baseRef = review.pr?.baseRef ?? (review.forge ? await review.forge.defaultBranch() : 'local');
        const backend = params.local ? 'tuicr' : review.forge ? review.vcs.provider : 'tuicr';
        return result(
          [
            `Backend: ${backend}`,
            `Forge: ${review.vcs.provider}${review.vcs.provider === 'none' ? '' : ` (${review.vcs.owner}/${review.vcs.repo})`}`,
            `Branch: ${review.vcs.branch} → ${baseRef}`,
            `Env: ide=${env.ide} mux=${env.mux} shell=${env.shell}`,
            `Store: ${store.link} → ${store.dest}`,
            review.pr ? `PR/MR: #${review.pr.number} ${review.pr.url}` : 'PR/MR: none',
            session ? `tuicr: ${session.slug} (${session.commentCount} comments)` : 'tuicr: none',
          ].join('\n'),
          { ...review, env, store, session, baseRef, backend },
        );
      },
    }),
    defineTool({
      name: 'review_open',
      label: 'review open',
      description: 'Create a draft PR/MR from the template registry, or launch a local tuicr target.',
      promptSnippet: 'Call review_open to start',
      promptGuidelines: ['Use local to select tuicr as the review backend.'],
      parameters: parameters(openSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = openSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        await ensureStore(review.cwd);
        if (params.local || !review.forge) return launchLocalReview(review, params.workingTree);
        const base = params.base ?? (await review.forge.defaultBranch());
        const template = await loadTemplate('review/draft-pr');
        const body = renderTemplate(template.content, {
          intent: params.intent ?? '<!-- Describe why this change is needed. -->',
          head: review.vcs.branch,
          base,
        });
        const pr = await review.forge.createDraftPr({
          title: params.title ?? deriveTitle(review.vcs.branch),
          body,
          base,
          head: review.vcs.branch,
        });
        return result(`Draft PR/MR created from ${template.source} template: ${pr.url}`, { pr, template });
      },
    }),
    defineTool({
      name: 'review_edit',
      label: 'review edit',
      description:
        'Switch to the requested PR branch when necessary and open its existing tuicr session without generating comments.',
      promptSnippet: 'Call review_edit for the local-only edit workflow',
      promptGuidelines: ['This tool never generates review findings.'],
      parameters: parameters(contextSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = contextSchema.parse(input);
        let review = await resolveReviewContext(cwdOf(params), params.target);
        if (review.pr && review.pr.headRef !== review.vcs.branch) {
          await switchBranch(review.cwd, review.pr.headRef);
          review = await resolveReviewContext(review.cwd, params.target);
        }
        await ensureStore(review.cwd);
        return launchLocalReview(review, params.workingTree);
      },
    }),
    defineTool({
      name: 'review_diff',
      label: 'review diff',
      description: 'Fetch the target PR/MR diff or auto-detected local working-tree diff.',
      promptSnippet: 'Call review_diff for the code under review',
      promptGuidelines: ['Ground findings in this diff.'],
      parameters: parameters(localSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        if (params.workingTree || (!review.pr && (params.local || !review.forge))) {
          const diff = await workingTreeDiff(review.cwd);
          return result(diff || 'No working-tree changes.', { diff, target: 'local' });
        }
        if (!review.pr || !review.forge) return result('No PR/MR matches this remote review target.');
        const diff = await review.forge.prDiff(review.pr.number);
        return result(diff || 'Empty diff.', { diff, pr: review.pr });
      },
    }),
    defineTool({
      name: 'review_gates',
      label: 'review gates',
      description: 'Run format, lint, test, conventional-subject, and available CI checks.',
      promptSnippet: 'Call review_gates before submitting findings',
      promptGuidelines: ['Report skipped gates as skipped.'],
      parameters: parameters(localSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        const gates: GateResult[] = await runMiseGates(review.cwd);
        const commit = await run('git', ['-C', review.cwd, 'log', '-1', '--format=%s']);
        const subject = commit.stdout.trim();
        if (subject) gates.push(checkConventionalSubject(subject));
        if (!params.local && review.pr && review.forge)
          gates.push(ciGate(await review.forge.prChecks(review.pr.number)));
        return result(gates.map((gate) => `- ${gate.name}: ${gate.status} — ${gate.detail}`).join('\n'), {
          results: gates,
        });
      },
    }),
    defineTool({
      name: 'review_submit',
      label: 'review submit',
      description: 'Write the review artifact and stage comments in the selected local or remote backend.',
      promptSnippet: 'Call review_submit with the findings JSON',
      promptGuidelines: ['Remote comments remain pending until review_publish.'],
      parameters: parameters(submitSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = submitSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        const model = modelRoute(ctx);
        const findings = dedupeFindings(params.findings as Finding[]);
        const gates = await runMiseGates(review.cwd);
        const baseRef = review.pr?.baseRef ?? (review.forge ? await review.forge.defaultBranch() : 'local');
        const artifact = await newReviewArtifactPath(
          review.cwd,
          params.workingTree || !review.pr ? 'local' : await reviewTargetId(review),
        );
        await writeFile(
          artifact,
          renderReviewDoc({
            title: params.title ?? review.pr?.title ?? review.vcs.branch,
            number: review.pr?.number,
            url: review.pr?.url,
            model,
            headRef: review.vcs.branch,
            baseRef,
            findings,
            overallIssues: params.overallIssues ?? [],
            gates,
            notVerified: params.notVerified ?? [],
          }),
          'utf8',
        );
        const useLocalBackend = Boolean(params.local || !review.forge);
        const comments = toReviewComments(findings, useLocalBackend ? undefined : model);
        if (useLocalBackend) {
          const session = await resolveTuicrSession(review, params.workingTree);
          if (!session) {
            return result(`Review written: ${artifact}. Open tuicr, then call review_submit again to seed comments.`, {
              artifact,
              count: findings.length,
            });
          }
          const backend = createLocalReviewBackend({
            session: session.path,
            artifactPath: artifact,
            author: localReviewAuthor(model),
          });
          await backend.stage({ comments, body: (params.overallIssues ?? []).join('\n') });
          return result(`Local review staged in tuicr: ${artifact}`, { artifact, count: findings.length, session });
        }
        if (!review.pr)
          return result(`Review written: ${artifact}. No PR/MR matches this remote target.`, { artifact });
        if (comments.length > 0) {
          await createRemoteReviewBackend(review.vcs, review.pr.number).stage({ comments, body: '' });
        }
        return result(
          `${comments.length > 0 ? 'Pending review staged' : 'Clean review recorded'} on #${review.pr.number}. Artifact: ${artifact}`,
          {
            artifact,
            pr: review.pr,
            count: findings.length,
          },
        );
      },
    }),
    defineTool({
      name: 'review_add_comment',
      label: 'review add comment',
      description: 'Add one provenance-marked comment through tuicr or the remote pending-review backend.',
      promptSnippet: 'Call review_add_comment for incremental comments',
      promptGuidelines: ['Pass local=true when tuicr owns the draft.'],
      parameters: parameters(addCommentSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = addCommentSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        const model = modelRoute(ctx);
        const useLocalBackend = Boolean(params.local || !review.forge);
        const comment: ReviewComment = {
          file: params.file,
          line: params.line,
          side: params.side ?? 'RIGHT',
          body: useLocalBackend ? params.body : withRemoteProvenance(params.body, model),
        };
        if (useLocalBackend) {
          const session = await resolveTuicrSession(review, params.workingTree);
          if (!session) return result('No matching tuicr session. Open review_edit or review_launch first.');
          const backend = createLocalReviewBackend({
            session: session.path,
            artifactPath: '',
            author: localReviewAuthor(model),
          });
          await backend.stage({ comments: [comment], body: '' });
          return result(`Comment added to tuicr session ${session.slug}.`, { session, comment });
        }
        if (!review.pr) return result('No PR/MR matches this remote review target.');
        await createRemoteReviewBackend(review.vcs, review.pr.number).stage({ comments: [comment], body: '' });
        return result(`Draft comment added to #${review.pr.number}.`, { pr: review.pr, comment });
      },
    }),
    defineTool({
      name: 'review_comments',
      label: 'review comments',
      description: 'Pull review threads or local tuicr comments and write a target-named artifact.',
      promptSnippet: 'Call review_comments before addressing findings',
      promptGuidelines: ['Pass local=true to prepare the local reply overlay.'],
      parameters: parameters(localSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        let threads: ReviewThreadRecord[];
        if (!params.workingTree && review.pr && review.forge) {
          threads = await createRemoteReviewBackend(review.vcs, review.pr.number).listThreads();
        } else if (params.local || !review.forge) {
          const session = await resolveTuicrSession(review, params.workingTree);
          if (!session) return result('No matching tuicr session found.');
          const draft = toFindings(await readSession(session.path));
          threads = draft.comments.map((comment, index) => ({
            id: `local-${index + 1}`,
            file: comment.file,
            line: comment.line,
            body: comment.body,
            resolved: false,
            question: /\?\s*$/.test(comment.body.trim()),
          }));
        } else {
          return result('No PR/MR matches this remote review target.');
        }
        const target = params.workingTree ? 'local' : await reviewTargetId(review);
        const artifact = await newReviewArtifactPath(review.cwd, target);
        await writeFile(
          artifact,
          renderThreadArtifact(review.pr?.title ?? review.vcs.branch, target, threads, {
            number: params.workingTree ? undefined : review.pr?.number,
            url: params.workingTree ? undefined : review.pr?.url,
          }),
          'utf8',
        );
        if (params.local && !params.workingTree && review.pr && review.forge) {
          const publication = await loadReviewPublicationState(review.cwd, review.vcs, review.pr.number);
          publication.state.overlayPath = artifact;
          await saveReviewPublicationState(publication.path, publication.state);
        }
        return result(
          threads
            .map((thread) => `${thread.id} ${thread.file ?? 'review'}:${thread.line ?? '-'} — ${thread.body}`)
            .join('\n') || 'No comments.',
          { artifact, threads },
        );
      },
    }),
    defineTool({
      name: 'review_respond',
      label: 'review respond',
      description: 'Record a local overlay reply or post a provenance-marked remote thread reply.',
      promptSnippet: 'Call review_respond after addressing a comment',
      promptGuidelines: ['Question replies remain unresolved.'],
      parameters: parameters(respondSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = respondSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        const model = modelRoute(ctx);
        if (params.local) {
          const target = params.workingTree ? 'local' : await reviewTargetId(review);
          const publication =
            !params.workingTree && review.pr && review.forge
              ? await loadReviewPublicationState(review.cwd, review.vcs, review.pr.number)
              : undefined;
          const artifact = publication?.state.overlayPath ?? (await latestThreadArtifact(review.cwd, review, target));
          if (!artifact) return result('No local review artifact. Run review_comments with local=true first.');
          const threads = await readThreadArtifact(artifact);
          const known = threads.find((thread) => thread.id === params.threadId);
          const question =
            known?.question === true || params.question === true || (!known && params.question === undefined);
          const tuicrSession = await resolveTuicrSession(review, params.workingTree);
          const session = tuicrSession?.path ?? '';
          await createLocalReviewBackend({ session, artifactPath: artifact, author: localReviewAuthor(model) }).reply({
            threadId: params.threadId,
            body: withRemoteProvenance(params.body, model),
            resolve: false,
            question,
          });
          return result(`Local reply recorded in ${artifact}.`, { artifact, question });
        }
        if (!review.pr || !review.forge) return result('No remote PR/MR for this reply.');
        const remote = createRemoteReviewBackend(review.vcs, review.pr.number);
        const remoteThreads = await remote.listThreads();
        const known = remoteThreads.find((thread) => thread.id === params.threadId);
        const question =
          known?.question === true || params.question === true || (!known && params.question === undefined);
        const resolve = question ? false : (params.resolve ?? true);
        await remote.reply({
          threadId: params.threadId,
          body: withRemoteProvenance(params.body, model),
          resolve,
          question,
        });
        return result(`Replied to ${params.threadId}${resolve ? ' and resolved it' : ' and left it open'}.`, {
          pr: review.pr,
          resolve,
        });
      },
    }),
    defineTool({
      name: 'review_publish',
      label: 'review publish',
      description:
        'Promote local drafts when needed, publish pending review work, and apply the selected public status.',
      promptSnippet: 'Call review_publish to make review work public',
      promptGuidelines: ['Statuses are COMMENT, APPROVE, REQUEST_CHANGES, or CLOSE.'],
      parameters: parameters(publishSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = publishSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        if (!review.pr || !review.forge) return result('No remote PR/MR to publish.');
        return publishResolvedReview(review as RemoteReviewContext, params, modelRoute(ctx));
      },
    }),
    defineTool({
      name: 'review_merge',
      label: 'review merge',
      description: 'Squash-merge an approved GitHub PR after checking its conventional subject.',
      promptSnippet: 'Call review_merge only after review_publish APPROVE',
      promptGuidelines: ['This is intentionally GitHub-only until GitLab merge support is added.'],
      parameters: parameters(contextSchema.extend({ subject: z.string().optional() })),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = contextSchema.extend({ subject: z.string().optional() }).parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        if (review.vcs.provider !== 'github' || !review.forge)
          return result('review_merge currently supports GitHub only.');
        if (!review.pr) return result('No open PR/MR for this branch.');
        const subject = params.subject ?? review.pr.title;
        const guard = conventionalMergeGuard(subject);
        if (guard.status !== 'pass') return result(`Merge blocked: ${guard.detail}`, { pr: review.pr, guard });
        await review.forge.mergePr(review.pr.number, subject);
        return result(`Merged #${review.pr.number} with subject: ${subject}.`, { pr: review.pr, guard });
      },
    }),
    defineTool({
      name: 'review_launch',
      label: 'review launch',
      description: 'Open the auto-detected tuicr target in a mux tab, configure Zed, or print the command.',
      promptSnippet: 'Call review_launch for the interactive tuicr TUI',
      promptGuidelines: ['Show the returned command when launch cannot open a tab.'],
      parameters: parameters(contextSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = contextSchema.parse(input);
        const review = await resolveReviewContext(cwdOf(params), params.target);
        return launchLocalReview(review, params.workingTree);
      },
    }),
  ];
}

// Publication -----------------------------------------------------------------

async function publishResolvedReview(review: RemoteReviewContext, params: PublishParams, model: string) {
  const status = params.status ?? 'COMMENT';
  const event = status === 'CLOSE' ? 'COMMENT' : status;
  assertReviewEventSupported(review.vcs.provider, event);
  const remote = createRemoteReviewBackend(review.vcs, review.pr.number);
  const promotion = params.local
    ? await promoteLocalReview(review, remote, model, Boolean(params.workingTree))
    : undefined;

  if (status !== 'CLOSE' && review.pr.isDraft) await review.forge.markReady(review.pr.number);
  await remote.publish(event);
  if (promotion) {
    promotion.publication.state.comments = [
      ...new Set([...promotion.publication.state.comments, ...promotion.commentFingerprints]),
    ];
    await saveReviewPublicationState(promotion.publication.path, promotion.publication.state);
  }
  if (status === 'CLOSE') await review.forge.closePr(review.pr.number);
  const finalPr = await review.forge.viewPr(String(review.pr.number));
  const promotedComments = promotion?.promotedComments ?? 0;
  const promotedReplies = promotion?.promotedReplies ?? 0;
  return result(
    `Published #${review.pr.number} (${status}); promoted ${promotedComments} comments and ${promotedReplies} replies.`,
    { pr: finalPr ?? review.pr, status, promotedComments, promotedReplies },
  );
}

async function promoteLocalReview(
  review: RemoteReviewContext,
  remote: ReviewBackend,
  model: string,
  workingTree: boolean,
): Promise<LocalPromotion> {
  const publication = await loadReviewPublicationState(review.cwd, review.vcs, review.pr.number);
  const session = await resolveTuicrSession(review, workingTree);
  if (!session) throw new Error('No matching tuicr session to publish.');
  const local = createLocalReviewBackend({
    session: session.path,
    artifactPath: '',
    author: localReviewAuthor(model),
  });
  const draft = await local.readDraft();
  const comments = draft.comments.map((comment) => ({
    ...comment,
    body: withRemoteProvenance(comment.body, comment.author?.replace(/^Agent:\s*/, '') || model),
  }));
  const commentFingerprints = comments.map(reviewCommentFingerprint);
  const remoteDraft = await remote.readDraft();
  const known = new Set([...publication.state.comments, ...remoteDraft.comments.map(reviewCommentFingerprint)]);
  const unpublished = unpublishedReviewComments(comments, known);
  if (unpublished.length > 0) await remote.stage({ comments: unpublished, body: '' });
  const promotedReplies = await promoteLocalReplies(review, remote, publication, model, workingTree);
  return {
    publication,
    commentFingerprints,
    promotedComments: unpublished.length,
    promotedReplies,
  };
}

async function promoteLocalReplies(
  review: RemoteReviewContext,
  remote: ReviewBackend,
  publication: Publication,
  model: string,
  workingTree: boolean,
): Promise<number> {
  const target = workingTree ? 'local' : await reviewTargetId(review);
  const artifact = workingTree
    ? await latestThreadArtifact(review.cwd, review, target)
    : (publication.state.overlayPath ?? (await latestThreadArtifact(review.cwd, review, target)));
  if (!artifact) return 0;
  if (!workingTree) publication.state.overlayPath = artifact;
  let count = 0;
  for (const thread of await readThreadArtifact(artifact)) {
    if (!thread.reply) continue;
    const body = withRemoteProvenance(thread.reply, model);
    const fingerprint = reviewReplyFingerprint(thread.id, body);
    if (publication.state.replies.includes(fingerprint)) continue;
    await remote.reply({
      threadId: thread.id,
      body,
      resolve: !thread.question,
      question: thread.question,
    });
    publication.state.replies.push(fingerprint);
    await saveReviewPublicationState(publication.path, publication.state);
    count += 1;
  }
  return count;
}

// Review target helpers -------------------------------------------------------

async function resolveReviewContext(cwd: string, target?: string): Promise<ReviewContext> {
  const vcs = await detectVcs(cwd);
  const forge = vcs.provider === 'none' ? undefined : createForge(vcs);
  const requested = target ? normalizeTarget(target) : vcs.branch;
  const pr = forge ? await forge.viewPr(requested) : undefined;
  return { cwd, vcs, forge, pr };
}

function normalizeTarget(target: string): string {
  return target.match(/\/(?:pull|merge_requests)\/(\d+)(?:\/|$)/)?.[1] ?? target;
}

function resolveTuicrSession(review: ReviewContext, workingTree = false) {
  return resolveReviewSession(review.cwd, {
    branch: review.vcs.branch,
    workingTree,
    owner: review.vcs.provider === 'none' ? undefined : review.vcs.owner,
    repo: review.vcs.provider === 'none' ? undefined : review.vcs.repo,
    number: review.pr?.number,
  });
}

async function launchLocalReview(review: ReviewContext, workingTree?: boolean) {
  const launched = await launch(review.cwd, workingTree ? undefined : review.pr?.number);
  const commandTarget = workingTree || !review.pr ? 'working tree' : `PR/MR #${review.pr.number}`;
  return result(
    launched.launched
      ? `Opened ${commandTarget} in tuicr (${launched.via}).`
      : (launched.instruction ?? `Run: ${launched.command}`),
    { launched, pr: review.pr, target: commandTarget },
  );
}

async function switchBranch(cwd: string, branch: string): Promise<void> {
  const dirty = await runChecked('git', ['-C', cwd, 'status', '--porcelain']);
  if (dirty.stdout.trim()) throw new Error(`Cannot switch to ${branch}: the current worktree has uncommitted changes.`);
  await runChecked('git', ['-C', cwd, 'fetch', 'origin', branch]);
  const local = await run('git', ['-C', cwd, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);
  if (local.code === 0) await runChecked('git', ['-C', cwd, 'switch', branch]);
  else await runChecked('git', ['-C', cwd, 'switch', '--track', '-c', branch, `origin/${branch}`]);
}

async function reviewTargetId(review: ReviewContext): Promise<string> {
  if (!review.pr) return 'local';
  if (review.pr.headSha) return review.pr.headSha.slice(0, 12);
  if (review.pr.headRef === review.vcs.branch) return headSha(review.cwd);
  const remote = await run('git', ['-C', review.cwd, 'ls-remote', 'origin', `refs/heads/${review.pr.headRef}`]);
  return remote.stdout.trim().split(/\s+/)[0]?.slice(0, 12) || headSha(review.cwd);
}

async function headSha(cwd: string): Promise<string> {
  const result = await runChecked('git', ['-C', cwd, 'rev-parse', '--short=12', 'HEAD']);
  return result.stdout.trim();
}

async function newReviewArtifactPath(cwd: string, target: string): Promise<string> {
  const dir = await reviewsDir(cwd);
  await mkdir(dir, { recursive: true });
  return uniqueRecordPath(dir, reviewRecordName(target));
}

async function readThreadArtifact(path: string): Promise<ReviewThreadRecord[]> {
  try {
    return parseThreadArtifact(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Expected local reply overlay is missing: ${path}`);
    }
    throw error;
  }
}

async function latestThreadArtifact(cwd: string, review: ReviewContext, target: string): Promise<string | undefined> {
  try {
    return await findLatestThreadArtifact(cwd, review, target);
  } catch (error) {
    throw new Error(`Cannot locate the latest review thread artifact for ${target}.`, { cause: error });
  }
}

async function findLatestThreadArtifact(
  cwd: string,
  review: ReviewContext,
  target: string,
): Promise<string | undefined> {
  const dir = await reviewsDir(cwd);
  const suffix = reviewSlug(target) || 'local';
  const names = await listReviewArtifactNames(dir);
  const candidates = await Promise.all(
    names.flatMap((name) => {
      if (!name.endsWith('.md')) return [];
      return [
        (async () => {
          const path = join(dir, name);
          const info = await stat(path);
          return { path, name, content: await readFile(path, 'utf8'), modified: info.mtimeMs };
        })(),
      ];
    }),
  );
  return candidates
    .filter(({ name, content }) => {
      if (!content.startsWith('<!-- diffpi-threads:')) return false;
      if (review.pr && target !== 'local') return content.includes(`- PR/MR: #${review.pr.number}`);
      return artifactNameMatches(name, suffix);
    })
    .sort((a, b) => b.modified - a.modified)[0]?.path;
}

async function listReviewArtifactNames(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    throw new Error(`Cannot read review artifacts in ${dir}.`, { cause: error });
  }
}

function deriveTitle(branch: string): string {
  return branch
    .replace(/^(feature|feat|fix|bug|chore)\//, '')
    .replace(/^eng-\d+-/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());
}

function uniqueRecordPath(dir: string, base: string): string {
  let path = join(dir, `${base}.md`);
  let count = 2;
  while (existsSync(path)) path = join(dir, `${base}-${count++}.md`);
  return path;
}

function artifactNameMatches(name: string, suffix: string): boolean {
  if (!name.endsWith('.md')) return false;
  const stem = name.slice(0, -3);
  const marker = `-${suffix}`;
  const markerIndex = stem.lastIndexOf(marker);
  if (markerIndex < 0) return false;
  const tail = stem.slice(markerIndex + marker.length);
  return tail === '' || /^-\d+$/.test(tail);
}
