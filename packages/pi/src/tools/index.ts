import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createDiffpiReloadTool } from './reload';
import { diffpiSetupTool, diffpiValidateTool } from './setup';

// Exports ---------------------------------------------------------------------

export { createDiffpiReloadTool } from './reload';
export { diffpiSetupTool, diffpiValidateTool } from './setup';

// Tool catalog ----------------------------------------------------------------

export function createPiTools(pi: Pick<ExtensionAPI, 'sendUserMessage'>) {
  return [diffpiSetupTool, diffpiValidateTool, createDiffpiReloadTool(pi)] as const;
}
