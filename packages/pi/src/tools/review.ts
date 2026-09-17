import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { detectIde, detectMux, detectShell, detectVcs } from '../environment';
import { assertReviewEventSupported, createForge, type ReviewEvent } from '../forge';
import { checkConventionalSubject, ciGate, runMiseGates, type GateResult } from '../gates';
import { run, runChecked } from '../process';
import {
  dedupeFindings,
  findingsSchema,
  renderReviewDoc,
  reviewRecordName,
  reviewSlug,
  reviewWorkingDir,
  toReviewComments,
  type Finding,
} from '../review';
import { ensureStore, reviewsDir } from '../store';
import { launch, readSession, resolveSession, toFindings } from '../tuicr';

const contextSchema = z.object({ cwd: z.string().optional() });
const localSchema = contextSchema.extend({ local: z.boolean().optional() });
const openSchema = localSchema.extend({ title: z.string().optional(), base: z.string().optional() });
const submitSchema = localSchema.extend({
  findings: findingsSchema,
  overallIssues: z.array(z.string()).optional(),
  notVerified: z.array(z.string()).optional(),
  title: z.string().optional(),
});
const completeSchema = contextSchema.extend({
  action: z.enum(['accept', 'reject', 'close', 'local']),
  comment: z.string().optional(),
});
const eventSchema = localSchema.extend({ event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).optional() });
const respondSchema = contextSchema.extend({
  body: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
});

type CwdParams = { cwd?: string };

function parameters(schema: z.ZodTypeAny): ToolDefinition['parameters'] {
  return z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'];
}

function cwdOf(params: CwdParams): string {
  return params.cwd ?? process.cwd();
}

function result(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function conventionalMergeGuard(subject: string): GateResult {
  return checkConventionalSubject(subject);
}

export function assertGitHubMergeReady(input: string): void {
  let data: {
    isDraft?: boolean;
    state?: string;
    reviewDecision?: string;
    mergeStateStatus?: string;
    statusCheckRollup?: Array<{
      __typename?: string;
      name?: string;
      context?: string;
      status?: string;
      conclusion?: string;
      state?: string;
    }>;
  };
  try {
    data = JSON.parse(input) as typeof data;
  } catch {
    throw new Error('Merge blocked: GitHub readiness response was not valid JSON.');
  }

  const blockers: string[] = [];
  if (data.state !== 'OPEN') blockers.push(`pull request state is ${data.state ?? 'unknown'}`);
  if (data.isDraft) blockers.push('pull request is still a draft');
  if (data.reviewDecision !== 'APPROVED') {
    blockers.push(`review decision is ${data.reviewDecision || 'not approved'}`);
  }
  if (data.mergeStateStatus !== 'CLEAN') {
    blockers.push(`merge state is ${data.mergeStateStatus ?? 'unknown'}`);
  }
  for (const check of data.statusCheckRollup ?? []) {
    const name = check.name ?? check.context ?? 'unnamed check';
    if (check.__typename === 'CheckRun') {
      if (check.status !== 'COMPLETED') blockers.push(`${name} is ${check.status?.toLowerCase() ?? 'pending'}`);
      else if (!['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion ?? '')) {
        blockers.push(`${name} concluded ${(check.conclusion ?? 'unknown').toLowerCase()}`);
      }
    } else if (check.state !== 'SUCCESS') {
      blockers.push(`${name} is ${(check.state ?? 'pending').toLowerCase()}`);
    }
  }
  if (blockers.length > 0) throw new Error(`Merge blocked: ${blockers.join('; ')}.`);
}

export function reviewSubmissionBody(body: string): string {
  return body.trim() || 'Inline comments only.';
}

export function createReviewTools(): readonly ToolDefinition[] {
  return [
    defineTool({
      name: 'review_context',
      label: 'review context',
      description: 'Read-only orientation for the current forge, environment, store, branch, PR, and tuicr session.',
      promptSnippet: 'Call review_context first',
      promptGuidelines: ['Call this before every review workflow.'],
      parameters: parameters(contextSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = contextSchema.parse(input);
        const cwd = cwdOf(params);
        const vcs = await detectVcs(cwd);
        const store = await ensureStore(cwd);
        const env = { ide: detectIde(), mux: detectMux(), shell: detectShell() };
        const forge = vcs.provider === 'none' ? undefined : createForge(vcs);
        const pr = forge ? await forge.viewPr(vcs.branch) : undefined;
        const baseRef = pr?.baseRef ?? (forge ? await forge.defaultBranch() : 'local');
        const session = await resolveSession(cwd, vcs.branch);
        return result(
          [
            `Forge: ${vcs.provider}${vcs.provider === 'none' ? '' : ` (${vcs.owner}/${vcs.repo})`}`,
            `Branch: ${vcs.branch} → ${baseRef}`,
            `Env: ide=${env.ide} mux=${env.mux} shell=${env.shell}`,
            `Store: ${store.link} → ${store.dest}`,
            pr ? `PR/MR: #${pr.number} ${pr.url}` : 'PR/MR: none',
            session ? `tuicr: ${session.slug} (${session.commentCount} comments)` : 'tuicr: none',
          ].join('\n'),
          { vcs, env, store, pr, session, baseRef },
        );
      },
    }),
    defineTool({
      name: 'review_open',
      label: 'review open',
      description: 'Create a draft PR/MR, or launch a local tuicr review.',
      promptSnippet: 'Call review_open to start',
      promptGuidelines: ['Use local for the offline tuicr flow.'],
      parameters: parameters(openSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = openSchema.parse(input);
        const cwd = cwdOf(params);
        await ensureStore(cwd);
        const vcs = await detectVcs(cwd);
        if (params.local || vcs.provider === 'none') {
          const launched = await launch(cwd);
          const record = join(await reviewsDir(cwd), `${reviewRecordName(vcs.branch)}.md`);
          if (!existsSync(record)) await writeFile(record, `# Local review: ${vcs.branch}\n`, 'utf8');
          return result(
            launched.launched
              ? `Opened tuicr (${launched.via}). Record: ${record}`
              : `${launched.instruction ?? `Run: ${launched.command}`}\nRecord: ${record}`,
            { launched, record },
          );
        }
        const forge = createForge(vcs);
        const pr = await forge.createDraftPr({
          title: params.title ?? deriveTitle(vcs.branch),
          body: '<!-- fill in intent, changes, validation -->',
          base: params.base ?? (await forge.defaultBranch()),
          head: vcs.branch,
        });
        return result(`Draft PR/MR created: ${pr.url}`, { pr });
      },
    }),
    defineTool({
      name: 'review_diff',
      label: 'review diff',
      description: 'Fetch the forge diff or the local working-tree diff.',
      promptSnippet: 'Call review_diff for the code under review',
      promptGuidelines: ['Ground findings in this diff.'],
      parameters: parameters(localSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const cwd = cwdOf(params);
        const vcs = await detectVcs(cwd);
        if (params.local || vcs.provider === 'none') {
          const diff = await run('git', ['-C', cwd, 'diff', 'HEAD']);
          return result(diff.stdout || 'No working-tree changes.', { diff: diff.stdout });
        }
        const pr = await createForge(vcs).viewPr(vcs.branch);
        if (!pr) return result('No open PR/MR. Run review_open first.');
        const diff = await createForge(vcs).prDiff(pr.number);
        return result(diff || 'Empty diff.', { diff, pr });
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
        const cwd = cwdOf(params);
        const vcs = await detectVcs(cwd);
        const gates: GateResult[] = await runMiseGates(cwd);
        const subject = (await run('git', ['-C', cwd, 'log', '-1', '--format=%s'])).stdout.trim();
        if (subject) gates.push(checkConventionalSubject(subject));
        if (!params.local && vcs.provider !== 'none') {
          const forge = createForge(vcs);
          const pr = await forge.viewPr(vcs.branch);
          if (pr) gates.push(ciGate(await forge.prChecks(pr.number)));
        }
        return result(gates.map((gate) => `- ${gate.name}: ${gate.status} — ${gate.detail}`).join('\n'), {
          results: gates,
        });
      },
    }),
    defineTool({
      name: 'review_submit',
      label: 'review submit',
      description: 'Render findings to the shared review store and create a pending forge review unless local.',
      promptSnippet: 'Call review_submit with the findings JSON',
      promptGuidelines: ['Use concrete file and line values.'],
      parameters: parameters(submitSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = submitSchema.parse(input);
        const cwd = cwdOf(params);
        await ensureStore(cwd);
        const vcs = await detectVcs(cwd);
        const findings = dedupeFindings(params.findings as Finding[]);
        const slug = reviewSlug(params.title ?? vcs.branch) || 'review';
        const dir = reviewWorkingDir(await reviewsDir(cwd), slug);
        await mkdir(dir, { recursive: true });
        const gates = await runMiseGates(cwd);
        const forge = !params.local && vcs.provider !== 'none' ? createForge(vcs) : undefined;
        const pr = forge ? await forge.viewPr(vcs.branch) : undefined;
        const baseRef = pr?.baseRef ?? (forge ? await forge.defaultBranch() : 'local');
        const docPath = join(dir, 'new-review.md');
        await writeFile(
          docPath,
          renderReviewDoc({
            title: params.title ?? vcs.branch,
            headRef: vcs.branch,
            baseRef,
            findings,
            overallIssues: params.overallIssues ?? [],
            gates,
            notVerified: params.notVerified ?? [],
          }),
          'utf8',
        );
        if (!forge) return result(`Local review written: ${docPath}`, { docPath, count: findings.length });
        if (!pr) return result(`No open PR/MR. Review written: ${docPath}`, { docPath });
        await forge.createPendingReview(
          pr.number,
          toReviewComments(findings),
          reviewSubmissionBody((params.overallIssues ?? []).join('\n')),
        );
        return result(`Pending review posted to #${pr.number}. Doc: ${docPath}`, {
          docPath,
          pr,
          count: findings.length,
        });
      },
    }),
    defineTool({
      name: 'review_comments',
      label: 'review comments',
      description:
        'Read unresolved local tuicr comments. Forge thread retrieval is delegated to the forge MCP when available.',
      promptSnippet: 'Call review_comments before addressing findings',
      promptGuidelines: ['Use forge MCP thread tools when the review is remote.'],
      parameters: parameters(localSchema),
      executionMode: 'parallel',
      async execute(_id, input) {
        const params = localSchema.parse(input);
        const cwd = cwdOf(params);
        const vcs = await detectVcs(cwd);
        const session = await resolveSession(cwd, vcs.branch);
        if (!session) return result('No tuicr session found.');
        const normalized = toFindings(await readSession(session.path));
        return result(
          normalized.comments.map((comment) => `${comment.file}:${comment.line} — ${comment.body}`).join('\n') ||
            'No comments.',
          { session, comments: normalized.comments },
        );
      },
    }),
    defineTool({
      name: 'review_respond',
      label: 'review respond',
      description:
        'Append a response to the local review record; remote responses should use the forge MCP thread tool.',
      promptSnippet: 'Call review_respond after addressing a local comment',
      promptGuidelines: ['For remote reviews, prefer the forge MCP response and resolve tools.'],
      parameters: parameters(respondSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = respondSchema.parse(input);
        const cwd = cwdOf(params);
        const path = join(await reviewsDir(cwd), `${reviewRecordName((await detectVcs(cwd)).branch)}.md`);
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(
          path,
          `\n## Response${params.file ? ` — ${params.file}:${params.line ?? 1}` : ''}\n\n${params.body}\n`,
          { encoding: 'utf8', flag: 'a' },
        );
        return result(`Response recorded: ${path}`, { path });
      },
    }),
    defineTool({
      name: 'review_publish',
      label: 'review publish',
      description:
        'Mark a draft ready and submit its pending forge review, optionally publishing a local tuicr session.',
      promptSnippet: 'Call review_publish to publish',
      promptGuidelines: ['Pass local to publish a tuicr session first.'],
      parameters: parameters(eventSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = eventSchema.parse(input);
        const cwd = cwdOf(params);
        const vcs = await detectVcs(cwd);
        if (vcs.provider === 'none') return result('No forge detected; local review remains in the shared store.');
        const forge = createForge(vcs);
        const pr = await forge.viewPr(vcs.branch);
        if (!pr) return result('No open PR/MR for this branch.');
        const event: ReviewEvent = params.event ?? 'COMMENT';
        assertReviewEventSupported(forge.provider, event);
        let body = '';
        if (params.local) {
          const session = await resolveSession(cwd, vcs.branch);
          if (!session) return result('No tuicr session to publish.');
          const normalized = toFindings(await readSession(session.path));
          body = reviewSubmissionBody(normalized.body);
          await forge.createPendingReview(pr.number, normalized.comments, body);
        }
        if (pr.isDraft) await forge.markReady(pr.number);
        await forge.submitReview(pr.number, event, body);
        return result(`Published #${pr.number} (${event}).`, { pr, event });
      },
    }),
    defineTool({
      name: 'review_complete',
      label: 'review complete',
      description: 'Approve, request changes, close, or archive a review. This never merges.',
      promptSnippet: 'Call review_complete to finish without merging',
      promptGuidelines: ['Use review_merge separately for merging.'],
      parameters: parameters(completeSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = completeSchema.parse(input);
        const cwd = cwdOf(params);
        const vcs = await detectVcs(cwd);
        if (params.action === 'local') {
          const source = await resolveSession(cwd, vcs.branch);
          const dest = uniqueRecordPath(await reviewsDir(cwd), reviewRecordName(vcs.branch));
          if (source) {
            const normalized = toFindings(await readSession(source.path));
            await writeFile(
              dest,
              `# Completed review: ${vcs.branch}\n\n${normalized.body}\n\n${normalized.comments.map((comment) => `- ${comment.file}:${comment.line} — ${comment.body}`).join('\n')}\n`,
              'utf8',
            );
          } else await writeFile(dest, `# Completed review: ${vcs.branch}\n`, 'utf8');
          return result(`Local review archived: ${dest}`, { dest });
        }
        if (vcs.provider === 'none') return result('No forge detected. Use action=local for a local review.');
        const forge = createForge(vcs);
        const pr = await forge.viewPr(vcs.branch);
        if (!pr) return result('No open PR/MR for this branch.');
        if (params.action === 'accept') {
          if (pr.isDraft) await forge.markReady(pr.number);
          await forge.submitReview(pr.number, 'APPROVE', params.comment ?? 'Approved.');
          return result(`Approved #${pr.number}. Merge separately with review_merge.`, { pr });
        }
        if (params.action === 'reject') {
          await forge.submitReview(pr.number, 'REQUEST_CHANGES', params.comment ?? 'Requesting changes.');
          return result(`Requested changes on #${pr.number}.`, { pr });
        }
        await forge.closePr(pr.number, params.comment);
        return result(`Closed #${pr.number}.`, { pr });
      },
    }),
    defineTool({
      name: 'review_merge',
      label: 'review merge',
      description: 'Squash-merge an approved GitHub PR after checking its conventional subject.',
      promptSnippet: 'Call review_merge only after review_complete accept',
      promptGuidelines: ['This is intentionally GitHub-only until GitLab merge support is added.'],
      parameters: parameters(contextSchema.extend({ subject: z.string().optional() })),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = contextSchema.extend({ subject: z.string().optional() }).parse(input);
        const cwd = cwdOf(params);
        const vcs = await detectVcs(cwd);
        if (vcs.provider !== 'github') return result('review_merge currently supports GitHub only.');
        const pr = await createForge(vcs).viewPr(vcs.branch);
        if (!pr) return result('No open PR/MR for this branch.');
        const subject = params.subject ?? pr.title;
        const guard = conventionalMergeGuard(subject);
        if (guard.status !== 'pass') {
          return result(`Merge blocked: ${guard.detail}`, { pr, guard });
        }
        const readiness = await runChecked(
          'gh',
          [
            'pr',
            'view',
            String(pr.number),
            '--repo',
            `${vcs.owner}/${vcs.repo}`,
            '--json',
            'isDraft,state,reviewDecision,mergeStateStatus,statusCheckRollup',
          ],
          { capture: 'unbounded' },
        );
        assertGitHubMergeReady(readiness.stdout);
        await runChecked('gh', [
          'pr',
          'merge',
          String(pr.number),
          '--repo',
          `${vcs.owner}/${vcs.repo}`,
          '--squash',
          '--subject',
          subject,
        ]);
        return result(`Merged #${pr.number} with subject: ${subject}.`, { pr, guard });
      },
    }),
    defineTool({
      name: 'review_launch',
      label: 'review launch',
      description: 'Open tuicr in a mux tab, configure its Zed task, or print the command.',
      promptSnippet: 'Call review_launch for the interactive tuicr TUI',
      promptGuidelines: ['Show the returned command when launch cannot open a tab.'],
      parameters: parameters(contextSchema),
      executionMode: 'sequential',
      async execute(_id, input) {
        const params = contextSchema.parse(input);
        const launchResult = await launch(cwdOf(params));
        return result(
          launchResult.launched
            ? `Opened tuicr (${launchResult.via}).`
            : (launchResult.instruction ?? `Run: ${launchResult.command}`),
          {
            launch: launchResult,
          },
        );
      },
    }),
  ];
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
