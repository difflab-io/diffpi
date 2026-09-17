import type { ForgeProvider, VcsInfo } from './environment';
import { run, runChecked, type CommandResult } from './process';

export type ReviewSide = 'LEFT' | 'RIGHT';
export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface ReviewComment {
  file: string;
  line: number;
  side?: ReviewSide;
  body: string;
}

export interface PrRef {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRef: string;
  headRef: string;
}

export interface OpenPrOptions {
  title: string;
  body: string;
  base: string;
  head: string;
  draft?: boolean;
}

export interface Forge {
  readonly provider: ForgeProvider;
  createDraftPr(options: OpenPrOptions): Promise<PrRef>;
  viewPr(idOrBranch: string): Promise<PrRef | undefined>;
  defaultBranch(): Promise<string>;
  prDiff(id: number): Promise<string>;
  prChecks(id: number): Promise<string>;
  createPendingReview(id: number, comments: ReviewComment[], body: string): Promise<void>;
  submitReview(id: number, event: ReviewEvent, body: string): Promise<void>;
  markReady(id: number): Promise<void>;
  closePr(id: number, comment?: string): Promise<void>;
}

export function createForge(vcs: VcsInfo): Forge {
  if (vcs.provider === 'github') return new GithubForge(vcs);
  if (vcs.provider === 'gitlab') return new GitlabForge(vcs);
  throw new Error('No forge detected from the git remote. Use --local for an offline review.');
}

class GithubForge implements Forge {
  readonly provider: ForgeProvider = 'github';

  constructor(private readonly vcs: VcsInfo) {}

  private repoFlag(): string[] {
    return ['--repo', `${this.vcs.owner}/${this.vcs.repo}`];
  }

  async createDraftPr(options: OpenPrOptions): Promise<PrRef> {
    const args = [
      'pr',
      'create',
      ...this.repoFlag(),
      '--title',
      options.title,
      '--body',
      options.body,
      '--base',
      options.base,
      '--head',
      options.head,
    ];
    if (options.draft !== false) args.push('--draft');
    await runChecked('gh', args);
    const ref = await this.viewPr(options.head);
    if (!ref) throw new Error('Draft PR created but could not be resolved.');
    return ref;
  }

  async viewPr(idOrBranch: string): Promise<PrRef | undefined> {
    const args = [
      'pr',
      'view',
      idOrBranch,
      ...this.repoFlag(),
      '--json',
      'number,title,url,isDraft,baseRefName,headRefName',
    ];
    const result = await run('gh', args);
    if (result.code !== 0) {
      if (isConfirmedMissingChange('github', result.stderr || result.stdout)) return undefined;
      throw commandFailure('gh', args, result);
    }
    if (!result.stdout.trim()) throw new Error('GitHub returned an empty pull request response.');
    let data: {
      number: number;
      title: string;
      url: string;
      isDraft: boolean;
      baseRefName: string;
      headRefName: string;
    };
    try {
      data = JSON.parse(result.stdout) as typeof data;
    } catch {
      throw new Error('Cannot parse the GitHub pull request response as JSON.');
    }
    if (
      typeof data.number !== 'number' ||
      typeof data.title !== 'string' ||
      typeof data.url !== 'string' ||
      typeof data.isDraft !== 'boolean' ||
      typeof data.baseRefName !== 'string' ||
      typeof data.headRefName !== 'string'
    ) {
      throw new Error('GitHub returned an invalid pull request response.');
    }
    return {
      number: data.number,
      title: data.title,
      url: data.url,
      isDraft: data.isDraft,
      baseRef: data.baseRefName,
      headRef: data.headRefName,
    };
  }

  async defaultBranch(): Promise<string> {
    const result = await runChecked('gh', [
      'repo',
      'view',
      `${this.vcs.owner}/${this.vcs.repo}`,
      '--json',
      'defaultBranchRef',
      '--jq',
      '.defaultBranchRef.name',
    ]);
    return requireBranchName(result.stdout, 'GitHub');
  }

  async prDiff(id: number): Promise<string> {
    return (await runChecked('gh', ['pr', 'diff', String(id), ...this.repoFlag()], { capture: 'unbounded' })).stdout;
  }

  async prChecks(id: number): Promise<string> {
    return (await run('gh', ['pr', 'checks', String(id), ...this.repoFlag()])).stdout;
  }

  async createPendingReview(id: number, comments: ReviewComment[], body: string): Promise<void> {
    const payload = {
      body,
      comments: comments.map((comment) => ({
        path: comment.file,
        line: comment.line,
        side: comment.side ?? 'RIGHT',
        body: comment.body,
      })),
    };
    await runChecked(
      'gh',
      ['api', '--method', 'POST', `/repos/${this.vcs.owner}/${this.vcs.repo}/pulls/${id}/reviews`, '--input', '-'],
      { input: JSON.stringify(payload) },
    );
  }

  async submitReview(id: number, event: ReviewEvent, body: string): Promise<void> {
    const pending = await runChecked('gh', [
      'api',
      `/repos/${this.vcs.owner}/${this.vcs.repo}/pulls/${id}/reviews`,
      '--jq',
      '[.[] | select(.state=="PENDING")] | last | .id',
    ]);
    const reviewId = pending.stdout.trim();
    const endpoint = githubReviewSubmissionEndpoint(this.vcs.owner, this.vcs.repo, id, reviewId);
    const args = ['api', '--method', 'POST', endpoint, '-f', `event=${event}`];
    if (body.trim()) args.push('-f', `body=${body}`);
    await runChecked('gh', args);
  }

  async markReady(id: number): Promise<void> {
    await runChecked('gh', ['pr', 'ready', String(id), ...this.repoFlag()]);
  }

  async closePr(id: number, comment?: string): Promise<void> {
    const args = ['pr', 'close', String(id), ...this.repoFlag()];
    if (comment) args.push('--comment', comment);
    await runChecked('gh', args);
  }
}

class GitlabForge implements Forge {
  readonly provider: ForgeProvider = 'gitlab';

  constructor(private readonly vcs: VcsInfo) {}

  private project(): string {
    return `${this.vcs.owner}/${this.vcs.repo}`;
  }

  async createDraftPr(options: OpenPrOptions): Promise<PrRef> {
    await runChecked('glab', [
      'mr',
      'create',
      '--repo',
      this.project(),
      '--title',
      `Draft: ${options.title}`,
      '--description',
      options.body,
      '--target-branch',
      options.base,
      '--source-branch',
      options.head,
      '--yes',
    ]);
    const ref = await this.viewPr(options.head);
    if (!ref) throw new Error('Draft MR created but could not be resolved.');
    return ref;
  }

  async viewPr(idOrBranch: string): Promise<PrRef | undefined> {
    const args = ['mr', 'view', idOrBranch, '--repo', this.project(), '--output', 'json'];
    const result = await run('glab', args);
    if (result.code !== 0) {
      if (isConfirmedMissingChange('gitlab', result.stderr || result.stdout)) return undefined;
      throw commandFailure('glab', args, result);
    }
    if (!result.stdout.trim()) throw new Error('GitLab returned an empty merge request response.');
    let data: {
      iid: number;
      title: string;
      web_url: string;
      draft?: boolean;
      work_in_progress?: boolean;
      target_branch: string;
      source_branch: string;
    };
    try {
      data = JSON.parse(result.stdout) as typeof data;
    } catch {
      throw new Error('Cannot parse the GitLab merge request response as JSON.');
    }
    if (
      typeof data.iid !== 'number' ||
      typeof data.title !== 'string' ||
      typeof data.web_url !== 'string' ||
      typeof data.target_branch !== 'string' ||
      typeof data.source_branch !== 'string'
    ) {
      throw new Error('GitLab returned an invalid merge request response.');
    }
    return {
      number: data.iid,
      title: data.title,
      url: data.web_url,
      isDraft: Boolean(data.draft ?? data.work_in_progress),
      baseRef: data.target_branch,
      headRef: data.source_branch,
    };
  }

  async defaultBranch(): Promise<string> {
    const result = await runChecked('glab', [
      'api',
      `projects/${encodeURIComponent(this.project())}`,
      '--jq',
      '.default_branch',
    ]);
    return requireBranchName(result.stdout, 'GitLab');
  }

  async prDiff(id: number): Promise<string> {
    return (await runChecked('glab', ['mr', 'diff', String(id), '--repo', this.project()], { capture: 'unbounded' }))
      .stdout;
  }

  async prChecks(): Promise<string> {
    return (await run('glab', ['ci', 'status', '--repo', this.project()])).stdout;
  }

  async createPendingReview(id: number, comments: ReviewComment[], body: string): Promise<void> {
    const endpoint = `projects/${encodeURIComponent(this.project())}/merge_requests/${id}/draft_notes`;
    if (body.trim()) {
      await runChecked('glab', ['api', '--method', 'POST', endpoint, '--input', '-'], {
        input: JSON.stringify({ note: body }),
      });
    }
    if (comments.length === 0) return;
    const response = await runChecked('glab', [
      'api',
      `projects/${encodeURIComponent(this.project())}/merge_requests/${id}`,
    ]);
    const diffRefs = parseGitlabDiffRefs(response.stdout);
    for (const comment of comments) {
      const payload = {
        note: comment.body,
        position: {
          ...diffRefs,
          position_type: 'text',
          new_path: comment.file,
          old_path: comment.file,
          new_line: comment.side === 'LEFT' ? undefined : comment.line,
          old_line: comment.side === 'LEFT' ? comment.line : undefined,
        },
      };
      await runChecked('glab', ['api', '--method', 'POST', endpoint, '--input', '-'], {
        input: JSON.stringify(payload),
      });
    }
  }

  async submitReview(id: number, event: ReviewEvent, body: string): Promise<void> {
    assertReviewEventSupported(this.provider, event);
    const drafts = await runChecked('glab', [
      'api',
      `projects/${encodeURIComponent(this.project())}/merge_requests/${id}/draft_notes`,
    ]);
    const hasDrafts = hasGitlabDraftNotes(drafts.stdout);
    if (hasDrafts) {
      await runChecked('glab', [
        'api',
        '--method',
        'POST',
        `projects/${encodeURIComponent(this.project())}/merge_requests/${id}/draft_notes/bulk_publish`,
      ]);
    } else if (body.trim()) {
      await runChecked('glab', ['mr', 'note', String(id), '--repo', this.project(), '--message', body]);
    }
    if (event === 'APPROVE') await runChecked('glab', ['mr', 'approve', String(id), '--repo', this.project()]);
  }

  async markReady(id: number): Promise<void> {
    await runChecked('glab', ['mr', 'update', String(id), '--repo', this.project(), '--ready']);
  }

  async closePr(id: number, comment?: string): Promise<void> {
    if (comment) await runChecked('glab', ['mr', 'note', String(id), '--repo', this.project(), '--message', comment]);
    await runChecked('glab', ['mr', 'close', String(id), '--repo', this.project()]);
  }
}

export function assertReviewEventSupported(provider: ForgeProvider, event: ReviewEvent): void {
  if (provider === 'gitlab' && event === 'REQUEST_CHANGES') {
    throw new Error(
      'GitLab does not support REQUEST_CHANGES reviews; post a comment or reject the merge request manually.',
    );
  }
}

export function isConfirmedMissingChange(provider: ForgeProvider, output: string): boolean {
  const message = output.toLowerCase();
  if (provider === 'github') {
    return (
      message.includes('no pull requests found for branch') ||
      message.includes('could not find pull request') ||
      message.includes('could not resolve to a pullrequest')
    );
  }
  if (provider === 'gitlab') {
    return (
      message.includes('no open merge request') ||
      (/failed to get open merge request/.test(message) && /404(?: not found)?/.test(message))
    );
  }
  return false;
}

function commandFailure(command: string, args: string[], result: CommandResult): Error {
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
  return new Error(`${command} ${args.join(' ')} failed: ${detail}`);
}

function requireBranchName(output: string, provider: string): string {
  const branch = output.trim();
  if (!branch || branch === 'null') throw new Error(`${provider} did not return a default branch.`);
  return branch;
}

export function githubReviewSubmissionEndpoint(
  owner: string,
  repo: string,
  id: number,
  pendingReviewId: string,
): string {
  return pendingReviewId
    ? `/repos/${owner}/${repo}/pulls/${id}/reviews/${pendingReviewId}/events`
    : `/repos/${owner}/${repo}/pulls/${id}/reviews`;
}

export interface GitlabDiffRefs {
  base_sha: string;
  start_sha: string;
  head_sha: string;
}

export function parseGitlabDiffRefs(input: string): GitlabDiffRefs {
  let data: { diff_refs?: Partial<GitlabDiffRefs> };
  try {
    data = JSON.parse(input) as typeof data;
  } catch {
    throw new Error('Cannot create positioned GitLab draft notes: the merge request response was not valid JSON.');
  }
  const { base_sha, start_sha, head_sha } = data.diff_refs ?? {};
  if (!base_sha || !start_sha || !head_sha) {
    throw new Error('Cannot create positioned GitLab draft notes: merge request diff refs are unavailable.');
  }
  return { base_sha, start_sha, head_sha };
}

export function hasGitlabDraftNotes(input: string): boolean {
  try {
    const data = JSON.parse(input) as unknown;
    return Array.isArray(data) && data.length > 0;
  } catch {
    throw new Error('Cannot complete GitLab review: the draft notes response was not valid JSON.');
  }
}
