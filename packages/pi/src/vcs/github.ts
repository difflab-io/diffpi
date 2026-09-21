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
      const check = await gh(['pr', 'checks', String(id), ...repo]);
      if (check.code === 0) return { status: 'passed', detail: 'CI green' };
      if (check.code === 8) return { status: 'pending', detail: 'CI pending' };
      if (noCiReported(check.stdout, check.stderr)) return { status: 'skipped', detail: 'No CI checks reported.' };
      return { status: 'failed', detail: commandDetail(check.stdout, check.stderr, 'CI failed') };
    },
    async watchCommitCi(sha, options) {
      const runs = await ghChecked(
        ['run', 'list', ...repo, '--commit', sha, '--limit', '100', '--json', 'databaseId', '--jq', '.[].databaseId'],
        { signal: options.signal },
      );
      const runIds = runs.stdout
        .split('\n')
        .map((id) => id.trim())
        .filter(Boolean);
      if (!runIds.length) return { status: 'skipped', detail: `No GitHub Actions runs found for ${sha}.` };
      const watched = await Promise.all(
        runIds.map((runId) =>
          gh(
            [
              'run',
              'watch',
              runId,
              ...repo,
              '--exit-status',
              '--compact',
              '--interval',
              String(options.intervalSeconds),
            ],
            { signal: options.signal },
          ),
        ),
      );
      const failed = watched.find((result) => result.code !== 0);
      return failed
        ? { status: 'failed', detail: commandDetail(failed.stdout, failed.stderr, `GitHub Actions failed for ${sha}.`) }
        : { status: 'passed', detail: `GitHub Actions passed for ${sha}.` };
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

function noCiReported(stdout: string, stderr: string): boolean {
  return /no checks reported/i.test(`${stdout}\n${stderr}`);
}

function commandDetail(stdout: string, stderr: string, fallback: string): string {
  return stderr.trim() || stdout.trim() || fallback;
}
