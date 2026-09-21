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
      return (
        await glabChecked([
          'api',
          `projects/${encodeURIComponent(project)}/merge_requests/${id}/pipelines?per_page=100`,
        ])
      ).stdout;
    },
    async commitChecks(sha) {
      const response = await glabChecked([
        'api',
        `projects/${encodeURIComponent(project)}/repository/commits/${sha}/statuses?per_page=100`,
      ]);
      return formatGitLabCommitChecks(response.stdout);
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

export function formatGitLabCommitChecks(input: string): string {
  const statuses = parseJson<Array<{ name?: string; status?: string }>>(input, 'GitLab commit statuses');
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const check of statuses) {
    const name = check.name ?? 'unnamed check';
    if (seen.has(name)) continue;
    seen.add(name);
    const status = check.status?.toLowerCase();
    if (status === 'success' || status === 'skipped') lines.push(`pass: ${name}`);
    else if (status === 'failed' || status === 'canceled') lines.push(`fail: ${name}`);
    else lines.push(`pending: ${name}`);
  }
  return lines.join('\n');
}
