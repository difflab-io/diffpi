import type { VcsInfo } from '../environment';
import { gh, ghChecked } from '../extensions/ghx';
import { commandFailure, isConfirmedMissingChange, parseJson, requireBranchName } from './helpers';
import type { PrRef, VcsBackend } from './types';

type GithubPr = {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid?: string;
};

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
    const data = parseJson<GithubPr>(result.stdout, 'GitHub pull request');
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
    async createDraftPr(options) {
      const args = [
        'pr',
        'create',
        ...repo,
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
      await ghChecked(args);
      const ref = await viewPr(options.head);
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
    async commitChecks(sha) {
      const [checkRuns, statuses] = await Promise.all([
        ghChecked(['api', `repos/${vcs.owner}/${vcs.repo}/commits/${sha}/check-runs?per_page=100`]),
        ghChecked(['api', `repos/${vcs.owner}/${vcs.repo}/commits/${sha}/status`]),
      ]);
      return formatGitHubCommitChecks(checkRuns.stdout, statuses.stdout);
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

export function formatGitHubCommitChecks(checkRunsInput: string, statusesInput: string): string {
  const checkRuns = parseJson<{
    check_runs?: Array<{ name?: string; status?: string; conclusion?: string | null }>;
  }>(checkRunsInput, 'GitHub check runs');
  const statuses = parseJson<{
    statuses?: Array<{ context?: string; state?: string }>;
  }>(statusesInput, 'GitHub commit statuses');
  const lines = (checkRuns.check_runs ?? []).map((check) => {
    const name = check.name ?? 'unnamed check';
    if (check.status !== 'completed') return `pending: ${name}`;
    return ['success', 'skipped', 'neutral'].includes(check.conclusion?.toLowerCase() ?? '')
      ? `pass: ${name}`
      : `fail: ${name}`;
  });
  for (const status of statuses.statuses ?? []) {
    const name = status.context ?? 'unnamed status';
    const state = status.state?.toLowerCase();
    if (state === 'success') lines.push(`pass: ${name}`);
    else if (state === 'pending') lines.push(`pending: ${name}`);
    else lines.push(`fail: ${name}`);
  }
  return lines.join('\n');
}

export function assertGitHubMergeReady(input: string): void {
  const data = parseJson<{
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
  }>(input, 'GitHub readiness');
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
