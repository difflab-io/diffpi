// Public API ------------------------------------------------------------------

export { diffpiConfigPaths, findPreferredModel, loadDiffpiConfig, resolveAgentModelPreferences } from './config';
export { detectIde, detectMux, detectShell, detectVcs, openInNewTab, parseRemote } from './environment';
export { assertGitHubMergeReady, createForge } from './forge';
export { checkConventionalSubject, ciGate, CONVENTIONAL_COMMIT, runMiseGates } from './gates';
export {
  assertReviewEventSupported,
  createLocalReviewBackend,
  createRemoteReviewBackend,
  githubReviewSubmissionEndpoint,
  hasGitlabDraftNotes,
  parseGitlabDiffRefs,
} from './review-backend';
export { mcp } from './mcp';
export { mise } from './mise';
export { createModeController, discoverAgentModes, resolveAgentMode } from './modes';
export { pi } from './pi';
export {
  loadReviewPublicationState,
  reviewCommentFingerprint,
  reviewReplyFingerprint,
  saveReviewPublicationState,
  unpublishedReviewComments,
} from './review-publication';
export {
  computeProjectSlug,
  ensureStore,
  gitToplevel,
  reviewsDir,
  sessionsDir,
  storeDir,
  storeGlobalRoot,
} from './store';
export {
  addComment,
  launch,
  listSessions,
  readSession,
  resolvePrSession,
  resolveReviewSession,
  resolveSession,
  toFindings,
  tuicrAvailable,
} from './tuicr';
export {
  ensureZedReviewKeybinding,
  ensureZedReviewTask,
  zedKeymapPath,
  zedTasksPath,
  ZED_REVIEW_TASK_NAME,
} from './zed';
export {
  dedupeFindings,
  findingSchema,
  findingsSchema,
  yymmdd,
  localReviewAuthor,
  parseThreadArtifact,
  renderReviewDoc,
  renderThreadArtifact,
  reviewRecordName,
  reviewSlug,
  severitySchema,
  toReviewComments,
  upsertThreadReply,
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
export type {
  AgentMode,
  ModeCatalog,
  ModeController,
  ModeListOptions,
  ModePromptStrategy,
  ModeSelectionResult,
  ModeThinkingLevel,
} from './modes';
export type { CommandResult } from './process';
export type { ForgeProvider, Ide, LaunchOptions, LaunchResult, Mux, VcsInfo } from './environment';
export type { Forge, OpenPrOptions, PrRef } from './forge';
export type { ReviewPublicationState } from './review-publication';
export type { GitlabDiffRefs } from './review-backend';
export type {
  LocalReviewBackendOptions,
  ReviewBackend,
  ReviewComment,
  ReviewDraft,
  ReviewEvent,
  ReviewReply,
  ReviewSide,
  ReviewThreadArtifactOptions,
  ReviewThreadRecord,
} from './review-types';
export type { GateResult, GateStatus } from './gates';
export type { Finding, ReviewDocInput, Severity } from './review';
export type { StoreInfo } from './store';
export type { SessionSummary, SessionJson } from './tuicr';
export type { ZedEnsureResult } from './zed';
export type { IssueTracker, SetupAction, SetupOptions, SetupResult, SetupStatus } from './setup';
export type { LoadedTemplate, TemplateRegistryOptions } from './templates';
