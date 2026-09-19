import type { VcsInfo } from '../environment';
import { GitHubReviewBackend } from './github-review-backend';
import { GitLabReviewBackend } from './gitlab-review-backend';
import { LocalReviewBackend } from './local-review-backend';
import type { LocalReviewBackendOptions, ReviewBackend } from './types';

export type {
  LocalReviewBackendOptions,
  ReviewBackend,
  ReviewComment,
  ReviewDraft,
  ReviewEvent,
  ReviewReply,
  ReviewSide,
} from './types';
export { githubReviewSubmissionEndpoint } from './github-review-backend';
export {
  assertReviewEventSupported,
  hasGitlabDraftNotes,
  parseGitlabDiffRefs,
  type GitlabDiffRefs,
} from './gitlab-review-backend';

export function createRemoteReviewBackend(vcs: VcsInfo, number: number): ReviewBackend {
  if (vcs.provider === 'github') return GitHubReviewBackend(vcs, number);
  if (vcs.provider === 'gitlab') return GitLabReviewBackend(vcs, number);
  throw new Error('A remote review backend requires a GitHub or GitLab repository.');
}

export function createLocalReviewBackend(options: LocalReviewBackendOptions): ReviewBackend {
  return LocalReviewBackend(options);
}
