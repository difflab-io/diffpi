import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTool, type ExtensionContext, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { detectIde, detectMux, detectShell, detectVcs, type VcsInfo } from '../environment';
import { createVcsBackend, type VcsBackend as Forge, type PrRef } from '../vcs';
import { checkConventionalSubject, ciGate, runMiseGates, type GateResult } from '../gates';
import { run, runChecked } from '../extensions/processx';
import {
  assertReviewEventSupported,
  createLocalReviewBackend,
  createRemoteReviewBackend,
  loadReviewPublicationState,
  reviewBodyFingerprint,
  reviewCommentFingerprint,
  reviewReplyFingerprint,
  saveReviewPublicationState,
  unpublishedReviewComments,
  dedupeFindings,
  findingsSchema,
  localResponseMarker,
  localReviewAuthor,
  parseReviewThreadAction,
  parseThreadArtifact,
  renderReviewDoc,
  renderThreadArtifact,
  reviewRecordName,
  reviewSlug,
  toReviewComments,
  withRemoteProvenance,
  type Finding,
  type ReviewBackend,
  type ReviewComment,
  type ReviewThreadRecord,
} from '../review';
import { completedReviewsDir, ensureStore, reviewsDir } from '../store';
import { loadTemplate, renderTemplate } from '../templates';
import {
  addComment,
  launch,
  readSession,
  resolvePublishSession,
  resolveReviewSession,
  toLocalReviewThreads,
} from '../extensions/tuicrx';

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
  issueUrl: z.string().url().optional(),
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
const completeSchema = localSchema.extend({
  action: z.enum(['approve', 'reject', 'abandon']).optional(),
});

type WorkingDirectoryParams = { cwd?: string };
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
  bodyFingerprints: string[];
  commentFingerprints: string[];
  promotedBodies: number;
  promotedComments: number;
  promotedReplies: number;
};

// Public helpers --------------------------------------------------------------

export function hasReviewDraft(comments: readonly ReviewComment[], body: string): boolean {
  return comments.length > 0 || body.trim().length > 0;
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
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const store = await ensureStore(review.cwd);
        const env = { ide: detectIde(), mux: detectMux(), shell: detectShell() };
        const session = await resolveTuicrSession(review, Boolean(params.local || params.workingTree));
        const baseRef = review.pr?.baseRef ?? (review.forge ? await review.forge.defaultBranch() : 'local');
        const backend = params.local || params.workingTree ? 'tuicr' : (review.forge?.provider ?? 'unsupported');
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
          {
            cwd: review.cwd,
            vcs: review.vcs,
            pr: review.pr,
            env,
            store,
            session,
            baseRef,
            backend,
          },
        );
      },
    }),
    defineTool({
      name: 'review_new',
      label: 'review new',
      description: 'Create a new local tuicr review or a remote draft PR/MR and open it in tuicr.',
      promptSnippet: 'Call review_new to start',
      promptGuidelines: ['Use local to select tuicr as the review backend.'],
      parameters: parameters(openSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = openSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        await ensureStore(review.cwd);
        if (params.local || params.workingTree) return launchLocalReview(review, true, params.base);
        if (!review.forge) return result(unsupportedForgeMessage());
        if (review.pr)
          return result(
            `A remote review already exists for this branch: ${review.pr.url}. Use review_edit to open it.`,
          );
        await assertRemoteBranchReady(review.cwd);
        const base = params.base ?? (await review.forge.defaultBranch());
        const template = await loadTemplate('review/draft-pr');
        const body = renderTemplate(template.content, {
          intent: params.intent ?? '<!-- Describe why this change is needed. -->',
          issue_url: params.issueUrl ?? '<!-- Add issue tracker URL. -->',
          head: review.vcs.branch,
          base,
        });
        const pr = await review.forge.createDraftPr({
          title: params.title ?? deriveTitle(review.vcs.branch),
          body,
          base,
          head: review.vcs.branch,
        });
        const launched = await launch(review.cwd, pr.number);
        const openMessage = launched.launched
          ? `Opened PR/MR #${pr.number} in tuicr (${launched.via}).`
          : (launched.instruction ?? `Run: ${launched.command}`);
        return result(`Draft PR/MR created from ${template.source} template: ${pr.url}\n${openMessage}`, {
          pr,
          template,
          launched,
        });
      },
    }),
    defineTool({
      name: 'review_edit',
      label: 'review edit',
      description: 'Open an existing local tuicr session or remote PR/MR in tuicr without generating findings.',
      promptSnippet: 'Call review_edit to continue an existing review',
      promptGuidelines: ['This tool never creates review findings or a PR/MR.'],
      parameters: parameters(localSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        await ensureStore(review.cwd);
        if (params.local || params.workingTree) {
          if (!(await resolveTuicrSession(review, true)))
            return result('No local tuicr review exists. Use review_new with local=true to create one.');
          return launchLocalReview(review, true);
        }
        if (!review.forge) return result(unsupportedForgeMessage());
        if (!review.pr) return result('No remote PR/MR exists. Use review_new to create a draft review first.');
        return launchLocalReview(review, false);
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
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        if (params.local || params.workingTree) {
          const diff = await workingTreeDiff(review.cwd);
          return result(diff || 'No working-tree changes.', { diff, target: 'local' });
        }
        if (!review.forge) return result(unsupportedForgeMessage());
        if (!review.pr) return result('No PR/MR matches this remote review target.');
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
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
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
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const model = modelRoute(ctx);
        const useLocalBackend = Boolean(params.local || params.workingTree);
        if (!useLocalBackend && !review.forge) return result(unsupportedForgeMessage());
        const findings = dedupeFindings(params.findings as Finding[]);
        const gates = await runMiseGates(review.cwd);
        const baseRef = review.pr?.baseRef ?? (review.forge ? await review.forge.defaultBranch() : 'local');
        const artifact = await newReviewArtifactPath(
          review.cwd,
          params.local || params.workingTree || !review.pr ? 'uncommitted' : await reviewTargetId(review),
        );
        await writeFile(
          artifact,
          renderReviewDoc({
            title: params.title ?? review.pr?.title ?? review.vcs.branch,
            number: useLocalBackend ? undefined : review.pr?.number,
            url: useLocalBackend ? undefined : review.pr?.url,
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
        const comments = toReviewComments(findings, useLocalBackend ? undefined : model);
        const body = (params.overallIssues ?? []).join('\n');
        if (useLocalBackend) {
          const session = await resolveTuicrSession(review, Boolean(params.local || params.workingTree));
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
          await backend.stage({ comments, body });
          return result(`Local review staged in tuicr: ${artifact}`, { artifact, count: findings.length, session });
        }
        if (!review.pr)
          return result(`Review written: ${artifact}. No PR/MR matches this remote target.`, { artifact });
        const hasDraft = hasReviewDraft(comments, body);
        if (hasDraft) {
          await createRemoteReviewBackend(review.vcs, review.pr.number).stage({ comments, body });
        }
        return result(
          `${hasDraft ? 'Pending review staged' : 'Clean review recorded'} on #${review.pr.number}. Artifact: ${artifact}`,
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
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const model = modelRoute(ctx);
        const useLocalBackend = Boolean(params.local || params.workingTree);
        if (!useLocalBackend && !review.forge) return result(unsupportedForgeMessage());
        const comment: ReviewComment = {
          file: params.file,
          line: params.line,
          side: params.side ?? 'RIGHT',
          body: useLocalBackend ? params.body : withRemoteProvenance(params.body, model),
        };
        if (useLocalBackend) {
          const session = await resolveTuicrSession(review, Boolean(params.local || params.workingTree));
          if (!session) return result('No matching tuicr session. Open review_new or review_launch_ui first.');
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
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        let threads: ReviewThreadRecord[];
        let artifact: string;
        if (params.local || params.workingTree) {
          const session = await resolveTuicrSession(review, true);
          if (!session) return result('No matching tuicr session found.');
          artifact = await localThreadArtifactPath(review.cwd, session.slug);
          threads = await syncLocalThreadArtifact(
            artifact,
            review.pr?.title ?? review.vcs.branch,
            session.slug,
            toLocalReviewThreads(await readSession(session.path)),
          );
        } else if (review.pr && review.forge) {
          threads = await createRemoteReviewBackend(review.vcs, review.pr.number).listThreads();
          const target = await reviewTargetId(review);
          artifact = await newReviewArtifactPath(review.cwd, target);
          await writeFile(
            artifact,
            renderThreadArtifact(review.pr.title, target, threads, { number: review.pr.number, url: review.pr.url }),
            'utf8',
          );
        } else {
          return result(review.forge ? 'No PR/MR matches this remote review target.' : unsupportedForgeMessage());
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
      description: 'Post local question replies to tuicr and record their publish overlay, or reply to remote threads.',
      promptSnippet: 'Call review_respond after addressing a comment',
      promptGuidelines: ['Question replies remain unresolved.'],
      parameters: parameters(respondSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = respondSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const model = modelRoute(ctx);
        if (params.local) {
          const tuicrSession = await resolveTuicrSession(review, true);
          if (!tuicrSession) return result('No matching tuicr session. Open review_new or review_launch_ui first.');
          const artifact = await localThreadArtifactPath(review.cwd, tuicrSession.slug);
          if (!existsSync(artifact))
            return result('No local review artifact. Run review_comments with local=true first.');
          const threads = await readThreadArtifact(artifact);
          const known = threads.find((thread) => thread.id === params.threadId);
          const question =
            known?.question === true || params.question === true || (!known && params.question === undefined);
          const awaitUserDeletion = !question && params.resolve === true;
          await addComment(tuicrSession.path, `${localResponseMarker(params.threadId)}\n${params.body}`, {
            targetFile: known?.file,
            line: known?.line,
            side: 'new',
            username: localReviewAuthor(model),
          });
          await createLocalReviewBackend({
            session: tuicrSession.path,
            artifactPath: artifact,
            author: localReviewAuthor(model),
          }).reply({
            threadId: params.threadId,
            body: params.body,
            resolve: false,
            question,
          });
          return result(
            `Local ${question ? 'answer' : 'response'} posted to tuicr and recorded in ${artifact}${awaitUserDeletion ? '; delete the source comment in tuicr to resolve it' : ''}.`,
            { artifact, question, awaitUserDeletion, session: tuicrSession },
          );
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
        'Publish pending remote draft PR/MR review comments and status, or promote a local tuicr draft before publishing.',
      promptSnippet: 'Call review_publish to make remote review work public',
      promptGuidelines: ['Statuses are COMMENT, APPROVE, REQUEST_CHANGES, or CLOSE.'],
      parameters: parameters(publishSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = publishSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        if (!review.pr || !review.forge) return result('No remote PR/MR to publish.');
        return publishResolvedReview(review as RemoteReviewContext, params, modelRoute(ctx));
      },
    }),
    defineTool({
      name: 'review_complete',
      label: 'review complete',
      description: 'Approve, reject, or abandon a remote review, or archive a local review artifact.',
      promptSnippet: 'Call review_complete to finish a review without merging it.',
      promptGuidelines: ['A local completion archives the Diffpi artifact and deletes the matching tuicr session.'],
      parameters: parameters(completeSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = completeSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        if (params.local) {
          const session = await resolveTuicrSession(review, true);
          if (!session) return result('No matching local tuicr session to close.');
          const artifact = await localThreadArtifactPath(review.cwd, session.slug);
          if (!existsSync(artifact))
            return result('No local review artifact. Run review_comments with local=true first.');
          const archived = await uniqueRecordPath(await completedReviewsDir(review.cwd), reviewSlug(session.slug));
          await rename(artifact, archived);
          await unlink(session.path);
          return result(`Archived ${archived} and deleted the tuicr session ${session.slug}.`, {
            artifact: archived,
            session,
          });
        }
        if (!review.pr || !review.forge) return result('No remote PR/MR to complete.');
        if (!params.action) return result('Choose a complete action: approve, reject, or abandon.');
        const status = { approve: 'APPROVE', reject: 'REQUEST_CHANGES', abandon: 'CLOSE' }[
          params.action
        ] as PublishParams['status'];
        return publishResolvedReview(review as RemoteReviewContext, { ...params, status }, modelRoute(ctx));
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
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        if (review.vcs.provider !== 'github' || !review.forge)
          return result('review_merge currently supports GitHub only.');
        if (!review.pr) return result('No open PR/MR for this branch.');
        const subject = params.subject ?? review.pr.title;
        const guard = checkConventionalSubject(subject);
        if (guard.status !== 'pass') return result(`Merge blocked: ${guard.detail}`, { pr: review.pr, guard });
        await review.forge.mergePr(review.pr.number, subject);
        return result(`Merged #${review.pr.number} with subject: ${subject}.`, { pr: review.pr, guard });
      },
    }),
    defineTool({
      name: 'review_launch_ui',
      label: 'review launch UI',
      description: 'Open a tuicr UI in a mux tab, configure Zed, or return the command to run.',
      promptSnippet: 'Call review_launch_ui for the interactive tuicr TUI',
      promptGuidelines: ['Show the returned command when launch cannot open a tab.'],
      parameters: parameters(localSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const workingTree = Boolean(params.local || params.workingTree);
        if (!workingTree && !review.forge) return result(unsupportedForgeMessage());
        return launchLocalReview(review, workingTree);
      },
    }),
  ];
}

// Local thread ledger ---------------------------------------------------------

export async function syncLocalThreadArtifact(
  path: string,
  title: string,
  sessionSlug: string,
  threads: readonly ReviewThreadRecord[],
): Promise<ReviewThreadRecord[]> {
  let previous: ReviewThreadRecord[] = [];
  try {
    previous = parseThreadArtifact(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const previousById = new Map(previous.map((thread) => [thread.id, thread]));
  const currentIds = new Set(threads.map((thread) => thread.id));
  const current = threads.map((thread) => {
    const existing = previousById.get(thread.id);
    return {
      ...thread,
      resolved: false,
      addressed: existing?.addressed ?? Boolean(existing?.reply),
      reply: existing?.reply,
    };
  });
  const removed = previous
    .filter((thread) => !currentIds.has(thread.id))
    .map((thread) => ({ ...thread, resolved: true }));
  const merged = [...current, ...removed];
  await writeFile(path, renderThreadArtifact(title, sessionSlug, merged), 'utf8');
  return merged;
}

// Utils -----------------------------------------------------------------------

function parameters(schema: z.ZodTypeAny): ToolDefinition['parameters'] {
  return z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'];
}

function resolveWorkingDirectory(params: WorkingDirectoryParams): string {
  return params.cwd ?? process.cwd();
}

function result(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

function unsupportedForgeMessage(): string {
  return 'No supported GitHub or GitLab remote was detected. Use local=true for an offline tuicr review.';
}

function modelRoute(ctx: ExtensionContext): string {
  if (!ctx.model) throw new Error('Cannot record review provenance because Pi did not provide an active model route.');
  return `${ctx.model.provider}/${ctx.model.id}`;
}

// Publication -----------------------------------------------------------------

async function publishResolvedReview(review: RemoteReviewContext, params: PublishParams, model: string) {
  const status = params.status ?? 'COMMENT';
  const event = status === 'CLOSE' ? 'COMMENT' : status;
  assertReviewEventSupported(review.vcs.provider, event);
  const remote = createRemoteReviewBackend(review.vcs, review.pr.number);
  const promotion = params.local ? await promoteLocalReview(review, remote, model) : undefined;

  if (status !== 'CLOSE' && review.pr.isDraft) await review.forge.markReady(review.pr.number);
  await remote.publish(event);
  if (promotion) {
    promotion.publication.state.bodies = [
      ...new Set([...promotion.publication.state.bodies, ...promotion.bodyFingerprints]),
    ];
    promotion.publication.state.comments = [
      ...new Set([...promotion.publication.state.comments, ...promotion.commentFingerprints]),
    ];
    await saveReviewPublicationState(promotion.publication.path, promotion.publication.state);
  }
  if (status === 'CLOSE') await review.forge.closePr(review.pr.number);
  const finalPr = await review.forge.viewPr(String(review.pr.number));
  const promotedBodies = promotion?.promotedBodies ?? 0;
  const promotedComments = promotion?.promotedComments ?? 0;
  const promotedReplies = promotion?.promotedReplies ?? 0;
  return result(
    `Published #${review.pr.number} (${status}); promoted ${promotedBodies} review bodies, ${promotedComments} comments, and ${promotedReplies} replies.`,
    { pr: finalPr ?? review.pr, status, promotedBodies, promotedComments, promotedReplies },
  );
}

async function promoteLocalReview(
  review: RemoteReviewContext,
  remote: ReviewBackend,
  model: string,
): Promise<LocalPromotion> {
  const publication = await loadReviewPublicationState(review.cwd, review.vcs, review.pr.number);
  const session = await resolvePublishSession(review.cwd, {
    branch: review.vcs.branch,
    owner: review.vcs.provider === 'none' ? undefined : review.vcs.owner,
    repo: review.vcs.provider === 'none' ? undefined : review.vcs.repo,
    number: review.pr?.number,
  });
  if (!session) throw new Error('No matching tuicr session to publish.');
  const sessionIsWorkingTree = session.kind === 'local';
  const local = createLocalReviewBackend({
    session: session.path,
    artifactPath: '',
    author: localReviewAuthor(model),
  });
  const draft = await local.readDraft();
  const remoteThreads = await remote.listThreads();
  const threadReplies = sessionIsWorkingTree
    ? []
    : draft.comments.flatMap((comment) => {
        const thread = remoteThreads.find(
          (candidate) =>
            candidate.file === comment.file &&
            candidate.line === comment.line &&
            candidate.line !== undefined &&
            !candidate.body.includes('Generated review by Diffpi using'),
        );
        return thread ? [{ comment, thread }] : [];
      });
  const comments = draft.comments
    .filter(
      ({ file, line }) => !threadReplies.some((reply) => reply.comment.file === file && reply.comment.line === line),
    )
    .map((comment) => ({
      ...comment,
      body: withRemoteProvenance(comment.body, comment.author?.replace(/^Agent:\s*/, '') || model),
    }));
  const body = draft.body.trim() ? withRemoteProvenance(draft.body, model) : '';
  const bodyFingerprints = body ? [reviewBodyFingerprint(body)] : [];
  const commentFingerprints = comments.map(reviewCommentFingerprint);
  const remoteDraft = await remote.readDraft();
  const knownBodies = new Set(publication.state.bodies);
  if (remoteDraft.body.trim()) knownBodies.add(reviewBodyFingerprint(remoteDraft.body));
  const unpublishedBody = body && !knownBodies.has(reviewBodyFingerprint(body)) ? body : '';
  const known = new Set([...publication.state.comments, ...remoteDraft.comments.map(reviewCommentFingerprint)]);
  const unpublished = unpublishedReviewComments(comments, known);
  if (unpublished.length > 0 || unpublishedBody) await remote.stage({ comments: unpublished, body: unpublishedBody });
  const promotedReplies =
    (await promoteLocalReplies(review, remote, publication, model, sessionIsWorkingTree)) +
    (await promoteLocationReplies(remote, publication, threadReplies, model));
  return {
    publication,
    bodyFingerprints,
    commentFingerprints,
    promotedBodies: unpublishedBody ? 1 : 0,
    promotedComments: unpublished.length,
    promotedReplies,
  };
}

async function promoteLocationReplies(
  remote: ReviewBackend,
  publication: Publication,
  replies: readonly { comment: ReviewComment; thread: ReviewThreadRecord }[],
  model: string,
): Promise<number> {
  let count = 0;
  for (const { comment, thread } of replies) {
    const parsed = parseReviewThreadAction(comment.body);
    const body = parsed.body.trim();
    const action = parsed.action;
    const fingerprint = reviewReplyFingerprint(thread.id, `${action ?? 'reply'}\0${body}`);
    if (publication.state.replies.includes(fingerprint)) continue;
    const remoteBody = withRemoteProvenance(body, comment.author?.replace(/^Agent:\s*/, '') || model);
    if (body && !thread.replies?.some((reply) => reply === body || reply === remoteBody)) {
      await remote.reply({
        threadId: thread.id,
        body: remoteBody,
        resolve: false,
      });
    }
    if (action && remote.setResolved) await remote.setResolved(thread.id, action === 'resolve');
    publication.state.replies.push(fingerprint);
    await saveReviewPublicationState(publication.path, publication.state);
    count += 1;
  }
  return count;
}

async function promoteLocalReplies(
  review: RemoteReviewContext,
  remote: ReviewBackend,
  publication: Publication,
  model: string,
  workingTree: boolean,
): Promise<number> {
  const target = workingTree ? 'uncommitted' : await reviewTargetId(review);
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
  const forge = vcs.provider === 'none' ? undefined : createVcsBackend(vcs);
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

async function launchLocalReview(review: ReviewContext, workingTree?: boolean, requestedBase?: string) {
  const base = workingTree
    ? (requestedBase ?? review.pr?.baseRef ?? (review.forge ? await review.forge.defaultBranch() : undefined))
    : undefined;
  const launched = await launch(review.cwd, workingTree ? undefined : review.pr?.number, base);
  const commandTarget = workingTree || !review.pr ? 'full branch' : `PR/MR #${review.pr.number}`;
  return result(
    launched.launched
      ? `Opened ${commandTarget} in tuicr (${launched.via}).`
      : (launched.instruction ?? `Run: ${launched.command}`),
    { launched, pr: review.pr, target: commandTarget },
  );
}

async function assertRemoteBranchReady(cwd: string): Promise<void> {
  const dirty = await runChecked('git', ['-C', cwd, 'status', '--porcelain']);
  if (dirty.stdout.trim()) throw new Error('Commit and push all changes before opening a remote review.');

  const upstream = await run('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (upstream.code !== 0 || !upstream.stdout.trim())
    throw new Error('Push the current branch and set its upstream before opening a remote review.');

  const [head, pushed] = await Promise.all([
    runChecked('git', ['-C', cwd, 'rev-parse', 'HEAD']),
    runChecked('git', ['-C', cwd, 'rev-parse', '@{upstream}']),
  ]);
  if (head.stdout.trim() !== pushed.stdout.trim())
    throw new Error('Push the current branch before opening a remote review.');
}

async function reviewTargetId(review: ReviewContext): Promise<string> {
  if (!review.pr) return 'uncommitted';
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

async function localThreadArtifactPath(cwd: string, sessionSlug: string): Promise<string> {
  const dir = await reviewsDir(cwd);
  return join(dir, `${reviewSlug(sessionSlug) || 'local-review'}.md`);
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
  const suffix = reviewSlug(target) || 'uncommitted';
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
      if (review.pr && target !== 'local' && target !== 'uncommitted')
        return content.includes(`- PR/MR: #${review.pr.number}`);
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
