// Public API ------------------------------------------------------------------

export { diffpiConfigPaths, findPreferredModel, loadDiffpiConfig, resolveAgentModelPreferences } from './config';
export {
  detectIde,
  detectMux,
  detectShell,
  detectVcs,
  diffpiLaunchName,
  openFileAdjacent,
  openInNewTab,
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
  captureLocalReview,
  createRemoteReviewBackend,
  githubReviewSubmissionEndpoint,
  hasGitlabDraftNotes,
  parseGitlabDiffRefs,
} from './review';
export { mcp } from './mcp';
export { mise } from './extensions/misex';
export { createModeController, discoverAgentModes, resolveAgentMode } from './modes';
export { pi } from './pi';
export { readLocalReview } from './review';
export { computeProjectSlug, ensureStore, plansDir, reviewsDir, storeDir, storeGlobalRoot } from './store';
export { createPlanStore } from './plan';
export {
  addComment,
  launch,
  listSessions,
  readSession,
  resolvePrSession,
  resolveReviewSession,
  resolveSession,
  tuicrAvailable,
} from './extensions/tuicrx';
export {
  ensureZedPlanTask,
  ensureZedReviewKeybinding,
  ensureZedReviewTask,
  zedKeymapPath,
  zedReviewTaskName,
  zedTasksPath,
  ZED_LOCAL_REVIEW_TASK_NAME,
  ZED_PLAN_ANNOTATE_TASK_NAME,
  ZED_PR_REVIEW_TASK_NAME,
  ZED_REVIEW_TASK_NAME,
} from './extensions/zedx';
export {
  dedupeFindings,
  findingSchema,
  findingsSchema,
  yymmdd,
  localReviewAuthor,
  renderReviewDoc,
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
export type {
  AgentMode,
  ModeCatalog,
  ModeController,
  ModeListOptions,
  ModePromptStrategy,
  ModeSelectionResult,
  ModeThinkingLevel,
} from './modes';
export type { CommandResult } from './extensions/processx';
export type { ForgeProvider, Ide, LaunchOptions, LaunchResult, Mux, VcsInfo } from './environment';
export type { Forge, OpenPrOptions, PrRef, VcsBackend } from './vcs';
export type { CaptureLocalReviewInput, GitlabDiffRefs, LocalReviewDump } from './review';
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
export type { Finding, ReviewDocInput, Severity } from './review';
export type { DiffpiLogEntry, NewLogEntry } from './log';
export type { StoreInfo } from './store';
export type * from './plan/types';
export type {
  InitPlanInput,
  NewPlanLogEntry,
  PlanCiUpdate,
  PlanResolution,
  PlanStoreOptions,
  ResolvePlanFilters,
} from './plan';
export type { SubagentCorrelation, SubagentEscalation } from './extensions/subagentx';
export type { SessionSummary, SessionJson } from './extensions/tuicrx';
export type { ZedEnsureResult } from './extensions/zedx';
export type { IssueTracker, SetupAction, SetupOptions, SetupResult, SetupStatus } from './setup';
export type { LoadedTemplate, TemplateRegistryOptions } from './templates';
