import type { ForgeProvider, VcsInfo } from '../environment';
import { gh, ghChecked } from '../extensions/ghx';
import { glab, glabChecked } from '../extensions/glabx';
import type { CommandResult } from '../extensions/processx';

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

/** Hosted VCS lifecycle operations. CLI execution is isolated in extensions/*x. */
export interface VcsBackend {
  readonly provider: Exclude<ForgeProvider, 'none'>;
  createDraftPr(options: OpenPrOptions): Promise<PrRef>;
  viewPr(idOrBranch: string): Promise<PrRef | undefined>;
  defaultBranch(): Promise<string>;
  prDiff(id: number): Promise<string>;
  prChecks(id: number): Promise<string>;
  markReady(id: number): Promise<void>;
  closePr(id: number, comment?: string): Promise<void>;
  mergePr(id: number, subject: string): Promise<void>;
}

/** Compatibility names retained for consumers of the former forge API. */
export type Forge = VcsBackend;
export const createVcsBackend = (vcs: VcsInfo): VcsBackend => {
  if (vcs.provider === 'github') return GitHubVcsBackend(vcs);
  if (vcs.provider === 'gitlab') return GitLabVcsBackend(vcs);
  throw new Error('No forge detected from the git remote. Use --local for an offline review.');
};
export const createForge = createVcsBackend;

export function GitHubVcsBackend(vcs: VcsInfo): VcsBackend {
  const repo = ['--repo', `${vcs.owner}/${vcs.repo}`];
  const viewPr = async (idOrBranch: string): Promise<PrRef | undefined> => {
    const args = [
      'pr',
      'view',
      idOrBranch,
      ...repo,
      '--json',
      'number,title,url,isDraft,baseRefName,headRefName,headRefOid',
    ];
    const result = await gh(args);
    if (result.code !== 0) {
      if (isConfirmedMissingChange('github', result.stderr || result.stdout)) return undefined;
      throw commandFailure('gh', args, result);
    }
    if (!result.stdout.trim()) throw new Error('GitHub returned an empty pull request response.');
    const data = parseJson(result.stdout, 'GitHub pull request') as GithubPr;
    if (
      typeof data.number !== 'number' ||
      typeof data.title !== 'string' ||
      typeof data.url !== 'string' ||
      typeof data.isDraft !== 'boolean' ||
      typeof data.baseRefName !== 'string' ||
      typeof data.headRefName !== 'string'
    )
      throw new Error('GitHub returned an invalid pull request response.');
    return {
      number: data.number,
      title: data.title,
      url: data.url,
      isDraft: data.isDraft,
      baseRef: data.baseRefName,
      headRef: data.headRefName,
      headSha: data.headRefOid,
    };
  };
  return {
    provider: 'github',
    async createDraftPr(o) {
      const args = ['pr', 'create', ...repo, '--title', o.title, '--body', o.body, '--base', o.base, '--head', o.head];
      if (o.draft !== false) args.push('--draft');
      await ghChecked(args);
      const ref = await viewPr(o.head);
      if (!ref) throw new Error('Draft PR created but could not be resolved.');
      return ref;
    },
    viewPr,
    async defaultBranch() {
      return requireBranchName(
        (
          await ghChecked([
            'repo',
            'view',
            `${vcs.owner}/${vcs.repo}`,
            '--json',
            'defaultBranchRef',
            '--jq',
            '.defaultBranchRef.name',
          ])
        ).stdout,
        'GitHub',
      );
    },
    async prDiff(id) {
      return (await ghChecked(['pr', 'diff', String(id), ...repo], { capture: 'unbounded' })).stdout;
    },
    async prChecks(id) {
      return (await gh(['pr', 'checks', String(id), ...repo])).stdout;
    },
    async markReady(id) {
      await ghChecked(['pr', 'ready', String(id), ...repo]);
    },
    async closePr(id, comment) {
      const args = ['pr', 'close', String(id), ...repo];
      if (comment) args.push('--comment', comment);
      await ghChecked(args);
    },
    async mergePr(id, subject) {
      const readiness = await ghChecked([
        'pr',
        'view',
        String(id),
        ...repo,
        '--json',
        'isDraft,state,reviewDecision,mergeStateStatus,statusCheckRollup',
      ]);
      assertGitHubMergeReady(readiness.stdout);
      await ghChecked(['pr', 'merge', String(id), ...repo, '--squash', '--subject', subject]);
    },
  };
}

type GithubPr = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid?: string;
};

export function GitLabVcsBackend(vcs: VcsInfo): VcsBackend {
  const project = `${vcs.owner}/${vcs.repo}`;
  const viewPr = async (idOrBranch: string): Promise<PrRef | undefined> => {
    const args = ['mr', 'view', idOrBranch, '--repo', project, '--output', 'json'];
    const result = await glab(args);
    if (result.code !== 0) {
      if (isConfirmedMissingChange('gitlab', result.stderr || result.stdout)) return undefined;
      throw commandFailure('glab', args, result);
    }
    if (!result.stdout.trim()) throw new Error('GitLab returned an empty merge request response.');
    const data = parseJson(result.stdout, 'GitLab merge request') as GitlabPr;
    if (
      typeof data.iid !== 'number' ||
      typeof data.title !== 'string' ||
      typeof data.web_url !== 'string' ||
      typeof data.target_branch !== 'string' ||
      typeof data.source_branch !== 'string'
    )
      throw new Error('GitLab returned an invalid merge request response.');
    return {
      number: data.iid,
      title: data.title,
      url: data.web_url,
      isDraft: Boolean(data.draft ?? data.work_in_progress),
      baseRef: data.target_branch,
      headRef: data.source_branch,
      headSha: data.sha,
    };
  };
  return {
    provider: 'gitlab',
    async createDraftPr(o) {
      await glabChecked([
        'mr',
        'create',
        '--repo',
        project,
        '--title',
        `Draft: ${o.title}`,
        '--description',
        o.body,
        '--target-branch',
        o.base,
        '--source-branch',
        o.head,
        '--yes',
      ]);
      const ref = await viewPr(o.head);
      if (!ref) throw new Error('Draft MR created but could not be resolved.');
      return ref;
    },
    viewPr,
    async defaultBranch() {
      return requireBranchName(
        (await glabChecked(['api', `projects/${encodeURIComponent(project)}`, '--jq', '.default_branch'])).stdout,
        'GitLab',
      );
    },
    async prDiff(id) {
      return (await glabChecked(['mr', 'diff', String(id), '--repo', project], { capture: 'unbounded' })).stdout;
    },
    async prChecks(id) {
      return (
        await glabChecked([
          'api',
          `projects/${encodeURIComponent(project)}/merge_requests/${id}/pipelines?per_page=100`,
        ])
      ).stdout;
    },
    async markReady(id) {
      await glabChecked(['mr', 'update', String(id), '--repo', project, '--ready']);
    },
    async closePr(id, comment) {
      if (comment) await glabChecked(['mr', 'note', String(id), '--repo', project, '--message', comment]);
      await glabChecked(['mr', 'close', String(id), '--repo', project]);
    },
    async mergePr() {
      throw new Error('Merge is not supported by the GitLab forge adapter.');
    },
  };
}

type GitlabPr = {
  iid: number;
  title: string;
  web_url: string;
  draft?: boolean;
  work_in_progress?: boolean;
  target_branch: string;
  source_branch: string;
  sha?: string;
};

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
      else if (!['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(check.conclusion ?? ''))
        blockers.push(`${name} concluded ${(check.conclusion ?? 'unknown').toLowerCase()}`);
    } else if (check.state !== 'SUCCESS') blockers.push(`${name} is ${(check.state ?? 'pending').toLowerCase()}`);
  }
  if (blockers.length > 0) throw new Error(`Merge blocked: ${blockers.join('; ')}.`);
}

export function isConfirmedMissingChange(provider: ForgeProvider, output: string): boolean {
  const message = output.toLowerCase();
  return provider === 'github'
    ? message.includes('no pull requests found for branch') ||
        message.includes('could not find pull request') ||
        message.includes('could not resolve to a pullrequest')
    : provider === 'gitlab'
      ? message.includes('no open merge request') ||
        (/failed to get open merge request/.test(message) && /404(?: not found)?/.test(message))
      : false;
}
function parseJson(value: string, name: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`Cannot parse the ${name} response as JSON.`);
  }
}
function commandFailure(command: string, args: string[], result: CommandResult): Error {
  return new Error(
    `${command} ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`}`,
  );
}
function requireBranchName(output: string, provider: string): string {
  const branch = output.trim();
  if (!branch || branch === 'null') throw new Error(`${provider} did not return a default branch.`);
  return branch;
}
