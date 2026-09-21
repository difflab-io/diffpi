import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';
import { diffpiLogTool } from './log';
import { createDiffpiReloadTool } from './reload';
import { createModeTools } from './modes';
import { createPlanTools } from './plan';
import { createReviewTools } from './review';
import { diffpiSetupTool, diffpiValidateTool } from './setup';
import { diffpiTemplateTool } from './templates';

// Exports ---------------------------------------------------------------------

export { diffpiLogTool } from './log';
export { createDiffpiReloadTool } from './reload';
export { createModeTools } from './modes';
export { createPlanTools } from './plan';
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
    ...createModeTools(modes),
    ...createReviewTools(),
    ...createPlanTools(pi, modes),
  ];
}
