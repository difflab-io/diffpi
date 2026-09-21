import type { VcsInfo } from '../environment';
import { glab, glabChecked } from '../extensions/glabx';
import { commandFailure, isConfirmedMissingChange, parseJson, requireBranchName } from './helpers';
import type { PrRef, VcsBackend } from './types';

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
    const data = parseJson<GitlabPr>(result.stdout, 'GitLab merge request');
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
    async createDraftPr(options) {
      await glabChecked([
        'mr',
        'create',
        '--repo',
        project,
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
      const ref = await viewPr(options.head);
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
      const response = await glabChecked([
        'api',
        `projects/${encodeURIComponent(project)}/merge_requests/${id}/pipelines?per_page=1`,
        '--jq',
        '.[0].status // empty',
      ]);
      return gitLabCiResult(response.stdout);
    },
    async watchCommitCi(sha, options) {
      const readBranchSha = async () =>
        (
          await glabChecked(
            [
              'api',
              `projects/${encodeURIComponent(project)}/repository/branches/${encodeURIComponent(vcs.branch)}`,
              '--jq',
              '.commit.id',
            ],
            { signal: options.signal },
          )
        ).stdout.trim();
      const before = await readBranchSha();
      if (before !== sha)
        throw new Error(`GitLab branch ${vcs.branch} points to ${before || 'no commit'}, not ${sha}.`);
      const result = await glab(['ci', 'status', '--repo', project, '--branch', vcs.branch, '--live', '--compact'], {
        signal: options.signal,
      });
      const after = await readBranchSha();
      if (after !== sha) throw new Error(`GitLab branch ${vcs.branch} moved from ${sha} to ${after || 'no commit'}.`);
      if (/no pipelines?/i.test(`${result.stdout}\n${result.stderr}`))
        return { status: 'skipped', detail: `No GitLab pipeline found for ${sha}.` };
      return result.code === 0
        ? { status: 'passed', detail: `GitLab CI passed for ${sha}.` }
        : { status: 'failed', detail: result.stderr.trim() || result.stdout.trim() || `GitLab CI failed for ${sha}.` };
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

function gitLabCiResult(input: string) {
  const status = input.trim().toLowerCase();
  if (!status || status === 'skipped') return { status: 'skipped' as const, detail: 'No active GitLab CI pipeline.' };
  if (status === 'success') return { status: 'passed' as const, detail: 'CI green' };
  if (['failed', 'canceled'].includes(status)) return { status: 'failed' as const, detail: 'CI failing' };
  return { status: 'pending' as const, detail: 'CI pending' };
}
