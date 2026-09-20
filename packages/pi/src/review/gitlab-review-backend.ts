import type { ForgeProvider, VcsInfo } from '../environment';
import { glabChecked } from '../extensions/glabx';
import type { ReviewBackend, ReviewComment, ReviewEvent, ReviewThreadRecord } from './types';

export function GitLabReviewBackend(vcs: VcsInfo, number: number): ReviewBackend {
  const project = () => `${vcs.owner}/${vcs.repo}`;
  const mergeRequestEndpoint = () => `projects/${encodeURIComponent(project())}/merge_requests/${number}`;

  const listThreads = async (): Promise<ReviewThreadRecord[]> => {
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
      const result = await glabChecked(['api', `${mergeRequestEndpoint()}/discussions?per_page=100&page=${page}`]);
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
  };

  return {
    kind: 'remote',
    async stage(draft) {
      const endpoint = `${mergeRequestEndpoint()}/draft_notes`;
      if (draft.body.trim()) {
        await glabChecked(['api', '--method', 'POST', endpoint, '--input', '-'], {
          input: JSON.stringify({ note: draft.body }),
        });
      }
      if (draft.comments.length === 0) return;
      const response = await glabChecked(['api', mergeRequestEndpoint()]);
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
    },
    async readDraft() {
      const result = await glabChecked(['api', `${mergeRequestEndpoint()}/draft_notes`]);
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
    },
    listThreads,
    async reply(input) {
      const endpoint = `${mergeRequestEndpoint()}/discussions/${encodeURIComponent(input.threadId)}`;
      const threads = await listThreads();
      const existing = threads.find((thread) => thread.id === input.threadId);
      if (!existing?.replies?.includes(input.body)) {
        await glabChecked(['api', '--method', 'POST', `${endpoint}/notes`, '--input', '-'], {
          input: JSON.stringify({ body: input.body }),
        });
      }
      if (input.resolve) await this.setResolved?.(input.threadId, true);
    },
    async setResolved(threadId, resolved) {
      const endpoint = `${mergeRequestEndpoint()}/discussions/${encodeURIComponent(threadId)}`;
      await glabChecked(['api', '--method', 'PUT', `${endpoint}?resolved=${resolved}`]);
    },
    async deleteThread(threadId) {
      const endpoint = `${mergeRequestEndpoint()}/discussions/${encodeURIComponent(threadId)}`;
      await glabChecked(['api', '--method', 'DELETE', endpoint]);
    },
    async publish(event) {
      assertReviewEventSupported(vcs.provider, event);
      const drafts = await glabChecked(['api', `${mergeRequestEndpoint()}/draft_notes`]);
      if (hasGitlabDraftNotes(drafts.stdout)) {
        await glabChecked(['api', '--method', 'POST', `${mergeRequestEndpoint()}/draft_notes/bulk_publish`]);
      }
      if (event === 'APPROVE') await glabChecked(['mr', 'approve', String(number), '--repo', project()]);
    },
  };
}

export function assertReviewEventSupported(provider: ForgeProvider, event: ReviewEvent): void {
  if (provider === 'gitlab' && event === 'REQUEST_CHANGES') {
    throw new Error(
      'GitLab does not support REQUEST_CHANGES reviews; post a comment or reject the merge request manually.',
    );
  }
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
