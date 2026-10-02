import { defineTool, type ExtensionContext, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { detectIde, detectMux, detectShell, detectVcs, type VcsInfo } from '../environment';
import { createVcsBackend, type VcsBackend as Forge, type PrRef } from '../vcs';
import { checkConventionalSubject, runMiseGates, type GateResult } from '../gates';
import { run, runChecked } from '../extensions/processx';
import {
  assertReviewEventSupported,
  createRemoteReviewBackend,
  dedupeFindings,
  reviewCommentFingerprint,
  findingsSchema,
  toReviewComments,
  withRemoteProvenance,
  type Finding,
  type ReviewComment,
  type ReviewDraft,
  type ReviewThreadRecord,
} from '../review';
import { ensureStore } from '../store';
import { loadTemplate } from '../templates';

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
  body: z.string().optional(),
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
  action: z.enum(['approve', 'reject', 'close']).optional(),
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

// Public helpers --------------------------------------------------------------

export function hasReviewDraft(comments: readonly ReviewComment[], body: string): boolean {
  return comments.length > 0 || body.trim().length > 0;
}

export function partitionReviewComments(
  comments: readonly ReviewComment[],
  knownFingerprints: ReadonlySet<string>,
  model: string,
) {
  const normalized = comments.map((comment) => {
    const published = { ...comment, body: withCommentProvenance(comment, model) };
    return { source: comment, published, fingerprint: reviewCommentFingerprint(published) };
  });
  return {
    checkpointed: normalized.filter((comment) => knownFingerprints.has(comment.fingerprint)),
    candidates: normalized.filter((comment) => !knownFingerprints.has(comment.fingerprint)),
  };
}

export function reviewResponseResolution(question: boolean, requested?: boolean): boolean {
  return question ? false : (requested ?? false);
}

export function workingTreeReplyDraft(thread: ReviewThreadRecord, body: string): ReviewDraft {
  if (!thread.file) return { comments: [], body };
  return {
    comments: [
      {
        file: thread.file,
        ...(thread.line === undefined ? {} : { line: thread.line, side: 'RIGHT' as const }),
        body,
      },
    ],
    body: '',
  };
}

export function resolveReviewThread(
  comment: ReviewComment,
  threads: readonly ReviewThreadRecord[],
): ReviewThreadRecord | undefined {
  const sourceCommentId = comment.sourceCommentId;
  if (sourceCommentId) {
    const identified = threads.find(
      (thread) =>
        thread.id === sourceCommentId ||
        thread.rootCommentId === sourceCommentId ||
        thread.commentIds?.includes(sourceCommentId),
    );
    if (identified) return identified;
  }
  const matches = threads.filter(
    (thread) => thread.file === comment.file && (thread.line ?? undefined) === (comment.line ?? undefined),
  );
  if (matches.length > 1)
    throw new Error(
      `Ambiguous remote review threads at ${comment.file}:${comment.line ?? 'file'}: ${matches.map((thread) => thread.id).join(', ')}.`,
    );
  return matches[0];
}

export function assertRenderedReviewBody(body: string): void {
  if (/{{[^{}]+}}/.test(body)) throw new Error('Review body contains unresolved template placeholders.');
  if (/<!--/.test(body)) throw new Error('Review body contains HTML comments.');
  const headings = [...body.matchAll(/^## (.+)$/gm)];
  for (const section of ['Intent', 'Changes', 'Validation', 'References', 'Further Work']) {
    const index = headings.findIndex((match) => match[1].trim() === section);
    const current = headings[index];
    if (!current || current.index === undefined) throw new Error(`Review body requires a filled ${section} section.`);
    const content = body.slice(current.index + current[0].length, headings[index + 1]?.index).trim();
    if (!content) throw new Error(`Review body requires a filled ${section} section.`);
  }
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
      description: 'Orient to the target, forge, environment, shared store, and PR/MR.',
      promptSnippet: 'Call review_context first',
      promptGuidelines: ['Call this before every review workflow.'],
      parameters: parameters(localSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const store = await ensureStore(review.cwd);
        const env = { ide: detectIde(), mux: detectMux(), shell: detectShell() };
        const baseRef = review.pr?.baseRef ?? (review.forge ? await review.forge.defaultBranch() : 'local');
        const backend = review.forge?.provider ?? 'unsupported';
        return result(
          [
            `Backend: ${backend}`,
            `Forge: ${review.vcs.provider}${review.vcs.provider === 'none' ? '' : ` (${review.vcs.owner}/${review.vcs.repo})`}`,
            `Branch: ${review.vcs.branch} → ${baseRef}`,
            `Env: ide=${env.ide} mux=${env.mux} shell=${env.shell}`,
            `Store: ${store.link} → ${store.dest}`,
            review.pr ? `PR/MR: #${review.pr.number} ${review.pr.url}` : 'PR/MR: none',
          ].join('\n'),
          {
            cwd: review.cwd,
            vcs: review.vcs,
            pr: review.pr,
            env,
            store,
            baseRef,
            backend,
          },
        );
      },
    }),
    defineTool({
      name: 'review_status',
      label: 'review status',
      description: 'Report remote review lifecycle status without requiring a forge.',
      promptSnippet: 'Call review_status for review lifecycle state',
      promptGuidelines: ['Use this for status even when no forge is available.'],
      parameters: parameters(localSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const status = await collectReviewStatus(review);
        return result(status.text, status.details);
      },
    }),
    defineTool({
      name: 'review_new',
      label: 'review new',
      description: 'Create a filled remote draft PR/MR.',
      promptSnippet: 'Call review_new to start',
      promptGuidelines: ['Use the skill workflow for direct-file local reviews.'],
      parameters: parameters(openSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = openSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        await ensureStore(review.cwd);
        if (params.local || params.workingTree)
          return result('Local reviews are direct Markdown files; follow the review new workflow instead.');
        if (!review.forge) return result(unsupportedForgeMessage());
        if (review.pr)
          return result(
            `A remote review already exists for this branch: ${review.pr.url}. Use review_edit to open it.`,
          );
        await assertRemoteBranchReady(review.cwd);
        const base = params.base ?? (await review.forge.defaultBranch());
        const template = await loadTemplate('review/draft-pr');
        if (!params.body) throw new Error('A fully rendered draft PR body is required.');
        assertRenderedReviewBody(params.body);
        const pr = await review.forge.createDraftPr({
          title: params.title ?? deriveTitle(review.vcs.branch),
          body: params.body,
          base,
          head: review.vcs.branch,
        });
        return result(`Draft PR/MR created from ${template.source} template: ${pr.url}`, {
          pr,
          template,
        });
      },
    }),
    defineTool({
      name: 'review_edit',
      label: 'review edit',
      description: 'Print the selected local review path or remote PR/MR URL without generating findings.',
      promptSnippet: 'Call review_edit to continue an existing review',
      promptGuidelines: ['This tool never creates review findings or a PR/MR.'],
      parameters: parameters(localSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        await ensureStore(review.cwd);
        if (params.local || params.workingTree)
          return result(
            'Local reviews are direct Markdown files; print the selected REVIEW.md path from the workflow.',
          );
        if (!review.forge) return result(unsupportedForgeMessage());
        if (!review.pr) return result('No remote PR/MR exists. Use review_new to create a draft review first.');
        return result(`PR/MR #${review.pr.number}: ${review.pr.url}`, { pr: review.pr, url: review.pr.url });
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
        if (!params.local && review.pr && review.forge) {
          const ci = await review.forge.prChecks(review.pr.number);
          gates.push({
            name: 'ci',
            status: ci.status === 'passed' ? 'pass' : ci.status === 'skipped' ? 'skip' : 'warn',
            detail: ci.detail,
          });
        }
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
        if (params.local || params.workingTree)
          return result('Local reviews are direct Markdown files; follow the review address workflow instead.');
        if (!review.forge) return result(unsupportedForgeMessage());
        const findings = dedupeFindings(params.findings as Finding[]);
        const comments = toReviewComments(findings, model);
        const body = (params.overallIssues ?? []).join('\n');
        if (!review.pr) return result('No PR/MR matches this remote target.');
        const hasDraft = hasReviewDraft(comments, body);
        if (hasDraft) {
          await createRemoteReviewBackend(review.vcs, review.pr.number).stage({ comments, body });
        }
        return result(`${hasDraft ? 'Pending review staged' : 'Clean review recorded'} on #${review.pr.number}.`, {
          pr: review.pr,
          count: findings.length,
        });
      },
    }),
    defineTool({
      name: 'review_add_comment',
      label: 'review add comment',
      description: 'Add one provenance-marked comment through the remote pending-review backend.',
      promptSnippet: 'Call review_add_comment for incremental comments',
      promptGuidelines: ['Use the direct-file workflow for local reviews.'],
      parameters: parameters(addCommentSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = addCommentSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const model = modelRoute(ctx);
        if (params.local || params.workingTree)
          return result('Local reviews are direct Markdown files; edit the selected REVIEW.md instead.');
        if (!review.forge) return result(unsupportedForgeMessage());
        const comment: ReviewComment = {
          file: params.file,
          line: params.line,
          side: params.side ?? 'RIGHT',
          body: withRemoteProvenance(params.body, model),
        };
        if (!review.pr) return result('No PR/MR matches this remote review target.');
        await createRemoteReviewBackend(review.vcs, review.pr.number).stage({ comments: [comment], body: '' });
        return result(`Draft comment added to #${review.pr.number}.`, { pr: review.pr, comment });
      },
    }),
    defineTool({
      name: 'review_comments',
      label: 'review comments',
      description: 'Pull remote review threads and return them for the direct-file workflow.',
      promptSnippet: 'Call review_comments before addressing findings',
      promptGuidelines: ['Use the direct-file workflow for local review files.'],
      parameters: parameters(localSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        let threads: ReviewThreadRecord[];
        if (params.local || params.workingTree)
          return result('Local reviews are direct Markdown files; read the selected REVIEW.md instead.');
        if (review.pr && review.forge) {
          threads = await createRemoteReviewBackend(review.vcs, review.pr.number).listThreads();
        } else {
          return result(review.forge ? 'No PR/MR matches this remote review target.' : unsupportedForgeMessage());
        }
        return result(
          threads
            .map((thread) => `${thread.id} ${thread.file ?? 'review'}:${thread.line ?? '-'} — ${thread.body}`)
            .join('\n') || 'No comments.',
          { threads },
        );
      },
    }),
    defineTool({
      name: 'review_respond',
      label: 'review respond',
      description: 'Reply to remote review threads.',
      promptSnippet: 'Call review_respond after addressing a comment',
      promptGuidelines: ['Question replies remain unresolved.'],
      parameters: parameters(respondSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = respondSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        const model = modelRoute(ctx);
        if (params.local || params.workingTree)
          return result('Local reviews are direct Markdown files; append the response to REVIEW.md instead.');
        if (!review.pr || !review.forge) return result('No remote PR/MR for this reply.');
        const remote = createRemoteReviewBackend(review.vcs, review.pr.number);
        const remoteThreads = await remote.listThreads();
        const known = remoteThreads.find((thread) => thread.id === params.threadId);
        const question =
          known?.question === true || params.question === true || (!known && params.question === undefined);
        const resolve = reviewResponseResolution(question, params.resolve);
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
      description: 'Publish pending remote draft PR/MR review comments and status.',
      promptSnippet: 'Call review_publish to make remote review work public',
      promptGuidelines: ['Statuses are COMMENT, APPROVE, REQUEST_CHANGES, or CLOSE.'],
      parameters: parameters(publishSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = publishSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        if (params.local || params.workingTree) return result('Local publish is unsupported; select a remote PR/MR.');
        if (!review.pr || !review.forge) return result('No remote PR/MR to publish.');
        return publishResolvedReview(review as RemoteReviewContext, params, modelRoute(ctx));
      },
    }),
    defineTool({
      name: 'review_complete',
      label: 'review complete',
      description: 'Approve, reject, or close a remote review.',
      promptSnippet: 'Call review_complete to finish a review without merging it.',
      promptGuidelines: ['Close closes the remote PR/MR without publishing a review first.'],
      parameters: parameters(completeSchema),
      executionMode: 'sequential',
      async execute(_id, input, _signal, _onUpdate, ctx) {
        const params = completeSchema.parse(input);
        const review = await resolveReviewContext(resolveWorkingDirectory(params), params.target);
        if (params.local || params.workingTree) return result('Local complete is unsupported; select a remote PR/MR.');
        if (!review.pr || !review.forge) return result('No remote PR/MR to complete.');
        if (!params.action) return result('Choose a complete action: approve, reject, or close.');
        if (params.action === 'close') {
          await review.forge.closePr(review.pr.number);
          return result(`Closed #${review.pr.number}.`, { pr: review.pr });
        }
        const status = params.action === 'approve' ? 'APPROVE' : 'REQUEST_CHANGES';
        return publishResolvedReview(review as RemoteReviewContext, { ...params, status }, modelRoute(ctx));
      },
    }),
    defineTool({
      name: 'review_merge',
      label: 'review merge',
      description: 'Squash-merge an open, ready GitHub PR through gh after checking its conventional subject.',
      promptSnippet:
        'Call review_merge directly; it uses gh to confirm the PR is open, ready, and CI is settled before merging',
      promptGuidelines: [
        'Do not query GitHub through MCP or duplicate readiness checks before calling review_merge.',
        'This is intentionally GitHub-only until GitLab merge support is added.',
      ],
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
  ];
}

// Utils -----------------------------------------------------------------------

function parameters(schema: z.ZodTypeAny): ToolDefinition['parameters'] {
  return z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'];
}

function resolveWorkingDirectory(params: WorkingDirectoryParams): string {
  return params.cwd ?? process.cwd();
}

function deriveTitle(branch: string): string {
  return branch
    .replace(/^(feature|feat|fix|bug|chore)\//, '')
    .replace(/^eng-\d+-/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());
}

function result(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

function unsupportedForgeMessage(): string {
  return 'No supported GitHub or GitLab remote was detected.';
}

async function collectReviewStatus(review: ReviewContext) {
  const [porcelain, branch] = await Promise.all([
    runChecked('git', ['-C', review.cwd, 'status', '--porcelain']),
    runChecked('git', ['-C', review.cwd, 'branch', '--show-current']),
  ]);
  const entries = porcelain.stdout.split('\\n').filter(Boolean);
  const staged = entries.filter((line) => !line.startsWith('??') && line[0] !== ' ').length;
  const unstaged = entries.filter((line) => !line.startsWith('??') && line[1] !== ' ').length;
  const untracked = entries.filter((line) => line.startsWith('??')).length;
  const remote = review.pr ? `yes (#${review.pr.number})` : 'no';
  const url = review.pr?.url ?? 'none';
  const text = [
    `Branch: ${branch.stdout.trim() || review.vcs.branch}`,
    `Worktree: ${entries.length ? 'dirty' : 'clean'} (staged=${staged}, unstaged=${unstaged}, untracked=${untracked})`,
    `Remote PR/MR: ${remote}`,
    `Remote URL: ${url}`,
  ].join('\\n');
  return {
    text,
    details: {
      branch: branch.stdout.trim(),
      staged,
      unstaged,
      untracked,
      pr: review.pr,
      url,
    },
  };
}

function modelRoute(ctx: ExtensionContext): string {
  if (!ctx.model) throw new Error('Cannot record review provenance because Pi did not provide an active model route.');
  return `${ctx.model.provider}/${ctx.model.id}`;
}

// Publication -----------------------------------------------------------------

async function publishResolvedReview(review: RemoteReviewContext, params: PublishParams, model: string) {
  void model;
  const status = params.status ?? 'COMMENT';
  const event = status === 'CLOSE' ? 'COMMENT' : status;
  assertReviewEventSupported(review.vcs.provider, event);
  const remote = createRemoteReviewBackend(review.vcs, review.pr.number);
  if (status !== 'CLOSE' && review.pr.isDraft) await review.forge.markReady(review.pr.number);
  await remote.publish(event);
  if (status === 'CLOSE') await review.forge.closePr(review.pr.number);
  const finalPr = await review.forge.viewPr(String(review.pr.number));
  return result(`Published #${review.pr.number} (${status}).`, { pr: finalPr ?? review.pr, status });
}

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

function withCommentProvenance(comment: ReviewComment, fallbackModel: string): string {
  const route = comment.author?.match(/^Agent:\s*(.+)$/)?.[1];
  return route ? withRemoteProvenance(comment.body, route || fallbackModel) : comment.body;
}
