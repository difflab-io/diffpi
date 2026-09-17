import type { ForgeProvider, VcsInfo } from './environment';
import { run, runChecked, type CommandResult } from './process';

export interface PrRef {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRef: string;
  headRef: string;
  headSha?: string;
}

export interface OpenPrOptions {
  title: string;
  body: string;
  base: string;
  head: string;
  draft?: boolean;
}

/**
 * PR/MR lifecycle adapter for a hosted code forge.
 *
 * Review state belongs to `ReviewBackend`; this interface owns lifecycle calls.
 */
export interface Forge {
  readonly provider: ForgeProvider;
  /** Create a draft PR/MR from a rendered title and body. */
  createDraftPr(options: OpenPrOptions): Promise<PrRef>;
  /** Resolve a PR/MR by number, URL-derived number, or source branch. */
  viewPr(idOrBranch: string): Promise<PrRef | undefined>;
  /** Read the repository's default target branch. */
  defaultBranch(): Promise<string>;
  /** Fetch the complete PR/MR diff. */
  prDiff(id: number): Promise<string>;
  /** Fetch checks or pipelines for this exact PR/MR. */
  prChecks(id: number): Promise<string>;
  /** Change a draft PR/MR to ready for review. */
  markReady(id: number): Promise<void>;
  /**
   * Close the PR/MR. This has no review status; publish a review separately.
   * An optional comment is posted before the close operation.
   */
  closePr(id: number, comment?: string): Promise<void>;
  /** Recheck GitHub readiness and squash-merge with the approved subject. */
  mergePr(id: number, subject: string): Promise<void>;
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
      'number,title,url,isDraft,baseRefName,headRefName,headRefOid',
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
      headRefOid?: string;
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
      headSha: data.headRefOid,
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
    const result = await runChecked('gh', ['pr', 'diff', String(id), ...this.repoFlag()], { capture: 'unbounded' });
    return result.stdout;
  }

  async prChecks(id: number): Promise<string> {
    const result = await run('gh', ['pr', 'checks', String(id), ...this.repoFlag()]);
    return result.stdout;
  }

  async markReady(id: number): Promise<void> {
    await runChecked('gh', ['pr', 'ready', String(id), ...this.repoFlag()]);
  }

  async closePr(id: number, comment?: string): Promise<void> {
    const args = ['pr', 'close', String(id), ...this.repoFlag()];
    if (comment) args.push('--comment', comment);
    await runChecked('gh', args);
  }

  async mergePr(id: number, subject: string): Promise<void> {
    const readiness = await runChecked('gh', [
      'pr',
      'view',
      String(id),
      ...this.repoFlag(),
      '--json',
      'isDraft,state,reviewDecision,mergeStateStatus,statusCheckRollup',
    ]);
    assertGitHubMergeReady(readiness.stdout);
    await runChecked('gh', ['pr', 'merge', String(id), ...this.repoFlag(), '--squash', '--subject', subject]);
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
      sha?: string;
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
      headSha: data.sha,
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

  async prChecks(id: number): Promise<string> {
    return (
      await runChecked('glab', [
        'api',
        `projects/${encodeURIComponent(this.project())}/merge_requests/${id}/pipelines?per_page=100`,
      ])
    ).stdout;
  }

  async markReady(id: number): Promise<void> {
    await runChecked('glab', ['mr', 'update', String(id), '--repo', this.project(), '--ready']);
  }

  async closePr(id: number, comment?: string): Promise<void> {
    if (comment) await runChecked('glab', ['mr', 'note', String(id), '--repo', this.project(), '--message', comment]);
    await runChecked('glab', ['mr', 'close', String(id), '--repo', this.project()]);
  }

  async mergePr(): Promise<void> {
    throw new Error('Merge is not supported by the GitLab forge adapter.');
  }
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
  if (data.reviewDecision !== 'APPROVED') blockers.push(`review decision is ${data.reviewDecision || 'not approved'}`);
  if (data.mergeStateStatus !== 'CLEAN') blockers.push(`merge state is ${data.mergeStateStatus ?? 'unknown'}`);
  for (const check of data.statusCheckRollup ?? []) {
    const name = check.name ?? check.context ?? 'unnamed check';
    if (check.__typename === 'CheckRun') {
      if (check.status !== 'COMPLETED') blockers.push(`${name} is ${check.status?.toLowerCase() ?? 'pending'}`);
      else if (!['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion ?? '')) {
        blockers.push(`${name} concluded ${(check.conclusion ?? 'unknown').toLowerCase()}`);
      }
    } else if (check.state !== 'SUCCESS') blockers.push(`${name} is ${(check.state ?? 'pending').toLowerCase()}`);
  }
  if (blockers.length > 0) throw new Error(`Merge blocked: ${blockers.join('; ')}.`);
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
