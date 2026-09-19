import type { VcsInfo } from '../environment';
import { ghChecked } from '../extensions/ghx';
import type { ReviewBackend, ReviewThreadRecord } from './types';

export function GitHubReviewBackend(vcs: VcsInfo, number: number): ReviewBackend {
  const pendingReview = async (): Promise<{ id: string; nodeId: string } | undefined> => {
    const result = await ghChecked([
      'api',
      `/repos/${vcs.owner}/${vcs.repo}/pulls/${number}/reviews`,
      '--jq',
      '[.[] | select(.state=="PENDING")] | last | {id: (.id | tostring), nodeId: .node_id}',
    ]);
    if (!result.stdout.trim()) return undefined;
    let pending: { id?: string; nodeId?: string };
    try {
      pending = JSON.parse(result.stdout) as typeof pending;
    } catch {
      throw new Error('Cannot parse the pending GitHub review identifier as JSON.');
    }
    if (!pending.id || !pending.nodeId) return undefined;
    return { id: pending.id, nodeId: pending.nodeId };
  };

  const listThreads = async (): Promise<ReviewThreadRecord[]> => {
    type GithubThread = {
      id: string;
      isResolved: boolean;
      path?: string;
      line?: number;
      comments?: { nodes?: Array<{ body: string; author?: { login?: string } }> };
    };
    const threads: GithubThread[] = [];
    let cursor: string | undefined;
    do {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${GITHUB_THREADS_QUERY}`,
        '-f',
        `owner=${vcs.owner}`,
        '-f',
        `repo=${vcs.repo}`,
        '-F',
        `number=${number}`,
      ];
      if (cursor) args.push('-f', `after=${cursor}`);
      const result = await ghChecked(args);
      let data: {
        data?: {
          repository?: {
            pullRequest?: {
              reviewThreads?: {
                nodes?: GithubThread[];
                pageInfo?: { hasNextPage?: boolean; endCursor?: string };
              };
            };
          };
        };
      };
      try {
        data = JSON.parse(result.stdout) as typeof data;
      } catch {
        throw new Error('Cannot parse GitHub review threads as JSON.');
      }
      const connection = data.data?.repository?.pullRequest?.reviewThreads;
      threads.push(...(connection?.nodes ?? []));
      cursor = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : undefined;
      if (connection?.pageInfo?.hasNextPage && !cursor) {
        throw new Error('GitHub review thread pagination did not return an end cursor.');
      }
    } while (cursor);
    return threads.map((thread) => {
      const nodes = thread.comments?.nodes ?? [];
      const comment = nodes[0];
      const body = comment?.body ?? '';
      return {
        id: thread.id,
        file: thread.path,
        line: thread.line,
        body,
        author: comment?.author?.login,
        resolved: thread.isResolved,
        question: /\?\s*$/.test(body.trim()),
        replies: nodes.slice(1).map((node) => node.body),
      };
    });
  };

  return {
    kind: 'remote',
    async stage(draft) {
      const pending = await pendingReview();
      if (!pending) {
        const payload = {
          body: draft.body,
          comments: draft.comments.map((comment) => ({
            path: comment.file,
            line: comment.line,
            side: comment.side ?? 'RIGHT',
            body: comment.body,
          })),
        };
        await ghChecked(
          ['api', '--method', 'POST', `/repos/${vcs.owner}/${vcs.repo}/pulls/${number}/reviews`, '--input', '-'],
          { input: JSON.stringify(payload) },
        );
        return;
      }
      if (draft.body.trim()) {
        await ghChecked([
          'api',
          '--method',
          'PUT',
          `/repos/${vcs.owner}/${vcs.repo}/pulls/${number}/reviews/${pending.id}`,
          '-f',
          `body=${draft.body}`,
        ]);
      }
      for (const comment of draft.comments) {
        await ghChecked([
          'api',
          'graphql',
          '-f',
          `query=${GITHUB_ADD_THREAD_MUTATION}`,
          '-f',
          `reviewId=${pending.nodeId}`,
          '-f',
          `body=${comment.body}`,
          '-f',
          `path=${comment.file}`,
          '-F',
          `line=${comment.line}`,
          '-f',
          `side=${comment.side ?? 'RIGHT'}`,
        ]);
      }
    },
    async readDraft() {
      const pending = await pendingReview();
      if (!pending) return { comments: [], body: '' };
      const review = await ghChecked(['api', `/repos/${vcs.owner}/${vcs.repo}/pulls/${number}/reviews/${pending.id}`]);
      const comments = await ghChecked([
        'api',
        `/repos/${vcs.owner}/${vcs.repo}/pulls/${number}/reviews/${pending.id}/comments`,
      ]);
      let reviewData: { body?: string };
      let commentData: Array<{
        path: string;
        line?: number;
        original_line?: number;
        side?: 'LEFT' | 'RIGHT';
        body: string;
      }>;
      try {
        reviewData = JSON.parse(review.stdout) as typeof reviewData;
        commentData = JSON.parse(comments.stdout) as typeof commentData;
      } catch {
        throw new Error('Cannot parse the pending GitHub review as JSON.');
      }
      return {
        body: reviewData.body ?? '',
        comments: commentData.map((comment) => ({
          file: comment.path,
          line: comment.line ?? comment.original_line ?? 1,
          side: comment.side,
          body: comment.body,
        })),
      };
    },
    listThreads,
    async reply(input) {
      const threads = await listThreads();
      const existing = threads.find((thread) => thread.id === input.threadId);
      if (!existing?.replies?.includes(input.body)) {
        await ghChecked([
          'api',
          'graphql',
          '-f',
          `query=${GITHUB_REPLY_MUTATION}`,
          '-f',
          `threadId=${input.threadId}`,
          '-f',
          `body=${input.body}`,
        ]);
      }
      if (input.resolve) {
        await ghChecked([
          'api',
          'graphql',
          '-f',
          `query=${GITHUB_RESOLVE_MUTATION}`,
          '-f',
          `threadId=${input.threadId}`,
        ]);
      }
    },
    async publish(event) {
      const pending = await pendingReview();
      if (!pending && event === 'COMMENT') return;
      if (!pending && event === 'REQUEST_CHANGES') {
        throw new Error('GitHub requires pending comments before publishing a request-changes review without a body.');
      }
      const endpoint = githubReviewSubmissionEndpoint(vcs.owner, vcs.repo, number, pending?.id ?? '');
      await ghChecked(['api', '--method', 'POST', endpoint, '-f', `event=${event}`]);
    },
  };
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

const GITHUB_THREADS_QUERY = `query($owner:String!,$repo:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{id,isResolved,path,line,comments(first:100){nodes{body,author{login}}}}pageInfo{hasNextPage,endCursor}}}}}`;
const GITHUB_ADD_THREAD_MUTATION = `mutation($reviewId:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!){addPullRequestReviewThread(input:{pullRequestReviewId:$reviewId,body:$body,path:$path,line:$line,side:$side}){thread{id}}}`;
const GITHUB_REPLY_MUTATION = `mutation($threadId:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$threadId,body:$body}){comment{id}}}`;
const GITHUB_RESOLVE_MUTATION = `mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}`;
