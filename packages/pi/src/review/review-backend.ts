import { readFile, writeFile } from 'node:fs/promises';
import type { ForgeProvider, VcsInfo } from '../environment';
import { ghChecked } from '../extensions/ghx';
import { glabChecked } from '../extensions/glabx';
import { parseThreadArtifact, upsertThreadReply } from './review-markdown';
import type {
  LocalReviewBackendOptions,
  ReviewBackend,
  ReviewComment,
  ReviewDraft,
  ReviewEvent,
  ReviewReply,
  ReviewThreadRecord,
} from './types';
import { addComment, readSession, toFindings } from '../tuicr';

export type {
  LocalReviewBackendOptions,
  ReviewBackend,
  ReviewComment,
  ReviewDraft,
  ReviewEvent,
  ReviewReply,
  ReviewSide,
} from './types';

// Factories -------------------------------------------------------------------

export function createRemoteReviewBackend(vcs: VcsInfo, number: number): ReviewBackend {
  if (vcs.provider === 'github') return new GithubReviewBackend(vcs, number);
  if (vcs.provider === 'gitlab') return new GitlabReviewBackend(vcs, number);
  throw new Error('A remote review backend requires a GitHub or GitLab repository.');
}

export function createLocalReviewBackend(options: LocalReviewBackendOptions): ReviewBackend {
  return new LocalReviewBackend(options);
}

// Local backend ---------------------------------------------------------------

class LocalReviewBackend implements ReviewBackend {
  readonly kind = 'local' as const;

  constructor(private readonly options: LocalReviewBackendOptions) {}

  async stage(draft: ReviewDraft): Promise<void> {
    for (const comment of draft.comments) {
      await addComment(this.options.session, comment.body, {
        targetFile: comment.file,
        line: comment.line,
        side: comment.side === 'LEFT' ? 'old' : 'new',
        username: this.options.author,
      });
    }
    if (draft.body.trim()) {
      await addComment(this.options.session, draft.body, { username: this.options.author });
    }
  }

  async readDraft(): Promise<ReviewDraft> {
    return toFindings(await readSession(this.options.session), { agentOnly: true, excludeLocalResponses: true });
  }

  async listThreads(): Promise<ReviewThreadRecord[]> {
    try {
      return parseThreadArtifact(await readFile(this.options.artifactPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async reply(input: ReviewReply): Promise<void> {
    const content = await readFile(this.options.artifactPath, 'utf8');
    await writeFile(
      this.options.artifactPath,
      upsertThreadReply(content, input.threadId, input.body, input.question, input.resolve),
      'utf8',
    );
  }

  async publish(): Promise<void> {
    throw new Error('Promote a local draft through a remote review backend before publishing it.');
  }
}

// GitHub backend --------------------------------------------------------------

class GithubReviewBackend implements ReviewBackend {
  readonly kind = 'remote' as const;

  constructor(
    private readonly vcs: VcsInfo,
    private readonly number: number,
  ) {}

  async stage(draft: ReviewDraft): Promise<void> {
    const pending = await this.pendingReview();
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
        [
          'api',
          '--method',
          'POST',
          `/repos/${this.vcs.owner}/${this.vcs.repo}/pulls/${this.number}/reviews`,
          '--input',
          '-',
        ],
        { input: JSON.stringify(payload) },
      );
      return;
    }
    if (draft.body.trim()) {
      await ghChecked([
        'api',
        '--method',
        'PUT',
        `/repos/${this.vcs.owner}/${this.vcs.repo}/pulls/${this.number}/reviews/${pending.id}`,
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
  }

  async readDraft(): Promise<ReviewDraft> {
    const pending = await this.pendingReview();
    if (!pending) return { comments: [], body: '' };
    const review = await ghChecked([
      'api',
      `/repos/${this.vcs.owner}/${this.vcs.repo}/pulls/${this.number}/reviews/${pending.id}`,
    ]);
    const comments = await ghChecked([
      'api',
      `/repos/${this.vcs.owner}/${this.vcs.repo}/pulls/${this.number}/reviews/${pending.id}/comments`,
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
  }

  async listThreads(): Promise<ReviewThreadRecord[]> {
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
        `owner=${this.vcs.owner}`,
        '-f',
        `repo=${this.vcs.repo}`,
        '-F',
        `number=${this.number}`,
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
  }

  async reply(input: ReviewReply): Promise<void> {
    const threads = await this.listThreads();
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
      await ghChecked(['api', 'graphql', '-f', `query=${GITHUB_RESOLVE_MUTATION}`, '-f', `threadId=${input.threadId}`]);
    }
  }

  async publish(event: ReviewEvent): Promise<void> {
    const pending = await this.pendingReview();
    if (!pending && event === 'COMMENT') return;
    if (!pending && event === 'REQUEST_CHANGES') {
      throw new Error('GitHub requires pending comments before publishing a request-changes review without a body.');
    }
    const endpoint = githubReviewSubmissionEndpoint(this.vcs.owner, this.vcs.repo, this.number, pending?.id ?? '');
    await ghChecked(['api', '--method', 'POST', endpoint, '-f', `event=${event}`]);
  }

  private async pendingReview(): Promise<{ id: string; nodeId: string } | undefined> {
    const result = await ghChecked([
      'api',
      `/repos/${this.vcs.owner}/${this.vcs.repo}/pulls/${this.number}/reviews`,
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
  }
}

// GitLab backend --------------------------------------------------------------

class GitlabReviewBackend implements ReviewBackend {
  readonly kind = 'remote' as const;

  constructor(
    private readonly vcs: VcsInfo,
    private readonly number: number,
  ) {}

  async stage(draft: ReviewDraft): Promise<void> {
    const endpoint = `${this.mergeRequestEndpoint()}/draft_notes`;
    if (draft.body.trim()) {
      await glabChecked(['api', '--method', 'POST', endpoint, '--input', '-'], {
        input: JSON.stringify({ note: draft.body }),
      });
    }
    if (draft.comments.length === 0) return;
    const response = await glabChecked(['api', this.mergeRequestEndpoint()]);
    const diffRefs = parseGitlabDiffRefs(response.stdout);
    for (const comment of draft.comments) {
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
      await glabChecked(['api', '--method', 'POST', endpoint, '--input', '-'], {
        input: JSON.stringify(payload),
      });
    }
  }

  async readDraft(): Promise<ReviewDraft> {
    const result = await glabChecked(['api', `${this.mergeRequestEndpoint()}/draft_notes`]);
    let notes: Array<{
      note?: string;
      position?: { new_path?: string; old_path?: string; new_line?: number; old_line?: number };
    }>;
    try {
      notes = JSON.parse(result.stdout) as typeof notes;
    } catch {
      throw new Error('Cannot parse GitLab draft notes as JSON.');
    }
    const comments: ReviewComment[] = [];
    const body: string[] = [];
    for (const note of notes) {
      if (!note.note) continue;
      const file = note.position?.new_path ?? note.position?.old_path;
      const line = note.position?.new_line ?? note.position?.old_line;
      if (file && line) {
        comments.push({
          file,
          line,
          side: note.position?.new_line ? 'RIGHT' : 'LEFT',
          body: note.note,
        });
      } else {
        body.push(note.note);
      }
    }
    return { comments, body: body.join('\n\n') };
  }

  async listThreads(): Promise<ReviewThreadRecord[]> {
    type GitlabDiscussion = {
      id: string;
      resolved?: boolean;
      notes?: Array<{
        body: string;
        author?: { username?: string };
        position?: { new_path?: string; old_path?: string; new_line?: number; old_line?: number };
      }>;
    };
    const discussions: GitlabDiscussion[] = [];
    for (let page = 1; ; page += 1) {
      const result = await glabChecked(['api', `${this.mergeRequestEndpoint()}/discussions?per_page=100&page=${page}`]);
      let batch: GitlabDiscussion[];
      try {
        batch = JSON.parse(result.stdout) as GitlabDiscussion[];
      } catch {
        throw new Error('Cannot parse GitLab review discussions as JSON.');
      }
      discussions.push(...batch);
      if (batch.length < 100) break;
    }
    return discussions.map((discussion) => {
      const notes = discussion.notes ?? [];
      const note = notes[0];
      const body = note?.body ?? '';
      return {
        id: discussion.id,
        file: note?.position?.new_path ?? note?.position?.old_path,
        line: note?.position?.new_line ?? note?.position?.old_line,
        body,
        author: note?.author?.username,
        resolved: Boolean(discussion.resolved),
        question: /\?\s*$/.test(body.trim()),
        replies: notes.slice(1).map((reply) => reply.body),
      };
    });
  }

  async reply(input: ReviewReply): Promise<void> {
    const endpoint = `${this.mergeRequestEndpoint()}/discussions/${encodeURIComponent(input.threadId)}`;
    const threads = await this.listThreads();
    const existing = threads.find((thread) => thread.id === input.threadId);
    if (!existing?.replies?.includes(input.body)) {
      await glabChecked(['api', '--method', 'POST', `${endpoint}/notes`, '--input', '-'], {
        input: JSON.stringify({ body: input.body }),
      });
    }
    if (input.resolve) await glabChecked(['api', '--method', 'PUT', `${endpoint}?resolved=true`]);
  }

  async publish(event: ReviewEvent): Promise<void> {
    assertReviewEventSupported(this.vcs.provider, event);
    const drafts = await glabChecked(['api', `${this.mergeRequestEndpoint()}/draft_notes`]);
    if (hasGitlabDraftNotes(drafts.stdout)) {
      await glabChecked(['api', '--method', 'POST', `${this.mergeRequestEndpoint()}/draft_notes/bulk_publish`]);
    }
    if (event === 'APPROVE') {
      await glabChecked(['mr', 'approve', String(this.number), '--repo', this.project()]);
    }
  }

  private project(): string {
    return `${this.vcs.owner}/${this.vcs.repo}`;
  }

  private mergeRequestEndpoint(): string {
    return `projects/${encodeURIComponent(this.project())}/merge_requests/${this.number}`;
  }
}

// Public helpers --------------------------------------------------------------

export function assertReviewEventSupported(provider: ForgeProvider, event: ReviewEvent): void {
  if (provider === 'gitlab' && event === 'REQUEST_CHANGES') {
    throw new Error(
      'GitLab does not support REQUEST_CHANGES reviews; post a comment or reject the merge request manually.',
    );
  }
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
    throw new Error('Cannot publish the GitLab review: the draft notes response was not valid JSON.');
  }
}

// Queries ---------------------------------------------------------------------

const GITHUB_THREADS_QUERY = `query($owner:String!,$repo:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{id,isResolved,path,line,comments(first:100){nodes{body,author{login}}}}pageInfo{hasNextPage,endCursor}}}}}`;
const GITHUB_ADD_THREAD_MUTATION = `mutation($reviewId:ID!,$body:String!,$path:String!,$line:Int!,$side:DiffSide!){addPullRequestReviewThread(input:{pullRequestReviewId:$reviewId,body:$body,path:$path,line:$line,side:$side}){thread{id}}}`;
const GITHUB_REPLY_MUTATION = `mutation($threadId:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$threadId,body:$body}){comment{id}}}`;
const GITHUB_RESOLVE_MUTATION = `mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}`;
