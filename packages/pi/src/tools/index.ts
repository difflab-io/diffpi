import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';
import { watchCiTool } from './ci';
import { diffpiLogTool } from './log';
import { planVerifyTool } from './plan';
import { createDiffpiReloadTool } from './reload';
import { createModeTools } from './modes';
import { createReviewTools } from './review';
import { diffpiSetupTool, diffpiValidateTool } from './setup';
import { diffpiTemplateTool } from './templates';

// Exports ---------------------------------------------------------------------

export { watchCiTool } from './ci';
export { diffpiLogTool } from './log';
export { planVerifyTool } from './plan';
export { createDiffpiReloadTool } from './reload';
export { createModeTools } from './modes';
export { createReviewTools } from './review';
export { diffpiSetupTool, diffpiValidateTool } from './setup';
export { diffpiTemplateTool } from './templates';

// Tool catalog ----------------------------------------------------------------

export function createPiTools(
  pi: Pick<ExtensionAPI, 'events' | 'sendUserMessage'>,
  modes: ModeController,
): readonly ToolDefinition[] {
  return [
    diffpiSetupTool,
    diffpiValidateTool,
    createDiffpiReloadTool(pi),
    diffpiLogTool,
    diffpiTemplateTool,
    planVerifyTool,
    watchCiTool,
    ...createModeTools(modes),
    ...createReviewTools(),
  ];
}
