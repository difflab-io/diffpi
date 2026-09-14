// Public API ------------------------------------------------------------------

export { mcp } from './mcp';
export { mise } from './mise';
export { pi } from './pi';
export {
  ensureMcpAdapters,
  ensureMise,
  ensureMiseDeps,
  ensureMiseHooks,
  ensurePiPlugins,
  ensurePiSkills,
  setupPi,
} from './setup';
export type { CommandResult } from './process';
export type { IssueTracker, SetupAction, SetupOptions, SetupResult, SetupStatus } from './setup';
