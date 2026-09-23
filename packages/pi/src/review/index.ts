// API ------------------------------------------------------------------------

export {
  dedupeFindings,
  findingSchema,
  findingsSchema,
  localReviewAuthor,
  reviewRecordName,
  reviewSlug,
  severitySchema,
  toReviewComments,
  withRemoteProvenance,
  yymmdd,
} from './types';
export type {
  Finding,
  ReviewBackend,
  ReviewComment,
  ReviewDocInput,
  ReviewDraft,
  ReviewEvent,
  ReviewReply,
  ReviewSide,
  ReviewThreadRecord,
  Severity,
} from './types';
export { renderReviewDoc } from './review-markdown';
export {
  assertReviewEventSupported,
  createRemoteReviewBackend,
  githubReviewSubmissionEndpoint,
  hasGitlabDraftNotes,
  parseGitlabDiffRefs,
} from './review-backend';
export type { GitlabDiffRefs } from './review-backend';
export { captureLocalReview, readLocalReview } from './local-reviews';
export type { CaptureLocalReviewInput, LocalReviewDump } from './local-reviews';
