// Public API ------------------------------------------------------------------

export { diffpiConfigPaths, findPreferredModel, loadDiffpiConfig, resolveAgentModelPreferences } from './config';
export {
  detectIde,
  detectMux,
  detectShell,
  detectVcs,
  diffpiLaunchName,
  openFileAdjacent,
  parseRemote,
} from './environment';
export { gitToplevel } from './extensions/gitx';
export {
  assertGitHubMergeReady,
  createForge,
  createForgeBackend,
  createVcsBackend,
  GitHubVcsBackend,
  GitLabVcsBackend,
} from './vcs';
export { checkConventionalSubject, CONVENTIONAL_COMMIT, runMiseGates } from './gates';
export {
  assertReviewEventSupported,
  createRemoteReviewBackend,
  githubReviewSubmissionEndpoint,
  hasGitlabDraftNotes,
  parseGitlabDiffRefs,
} from './review';
export { mcp } from './mcp';
export { mise } from './extensions/misex';
export { pi } from './pi';
export {
  loadReviewPublicationState,
  reviewBodyFingerprint,
  reviewCommentFingerprint,
  reviewReplyFingerprint,
  saveReviewPublicationState,
  unpublishedReviewComments,
} from './review';
export { computeProjectSlug, ensureStore, plansDir, reviewsDir, sessionsDir, storeDir, storeGlobalRoot } from './store';
export { verifyLivePlan } from './plan/verify';
export {
  dedupeFindings,
  findingSchema,
  findingsSchema,
  yymmdd,
  localReviewAuthor,
  reviewRecordName,
  reviewSlug,
  severitySchema,
  toReviewComments,
  withRemoteProvenance,
} from './review';
export {
  ensureMcpAdapters,
  ensureMise,
  ensureMiseDeps,
  ensureMiseHooks,
  ensurePiAgents,
  ensurePiPlugins,
  ensurePiSkills,
  setupPi,
} from './setup';
export { loadTemplate, renderTemplate, templateRelativePath } from './templates';
export type { DiffpiAgentConfig, DiffpiConfig, DiffpiConfigPaths, LoadedDiffpiConfig } from './config';
export type { CommandResult } from './extensions/processx';
export type { ForgeProvider, Ide, LaunchOptions, LaunchResult, Mux, VcsInfo } from './environment';
export type { Forge, OpenPrOptions, PrRef, VcsBackend } from './vcs';
export type { ReviewPublicationState } from './review';
export type { GitlabDiffRefs } from './review';
export type {
  ReviewBackend,
  ReviewComment,
  ReviewDraft,
  ReviewEvent,
  ReviewReply,
  ReviewSide,
  ReviewThreadRecord,
} from './review';
export type { GateResult, GateStatus } from './gates';
export type { Finding, Severity } from './review';
export type { DiffpiLogEntry, NewLogEntry } from './log';
export type { StoreInfo } from './store';
export type { PlanVerification, PlanVerificationIssue } from './plan/verify';
export type { SubagentCorrelation, SubagentEscalation } from './extensions/subagentx';
export type { IssueTracker, SetupAction, SetupOptions, SetupResult, SetupStatus } from './setup';
export type { LoadedTemplate, TemplateRegistryOptions } from './templates';
