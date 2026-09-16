// Public API ------------------------------------------------------------------

export { mcp } from './mcp';
export { mise } from './mise';
export { createModeController, discoverAgentModes, resolveAgentMode } from './modes';
export { pi } from './pi';
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
export type { IssueTracker, SetupAction, SetupOptions, SetupResult, SetupStatus } from './setup';
