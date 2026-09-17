import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';
import { createDiffpiReloadTool } from './reload';
import { createModeTools } from './modes';
import { createReviewTools } from './review';
import { diffpiSetupTool, diffpiValidateTool } from './setup';
import { diffpiTemplateTool } from './templates';

// Exports ---------------------------------------------------------------------

export { createDiffpiReloadTool } from './reload';
export { createModeTools } from './modes';
export { createReviewTools } from './review';
export { diffpiSetupTool, diffpiValidateTool } from './setup';
export { diffpiTemplateTool } from './templates';

// Tool catalog ----------------------------------------------------------------

export function createPiTools(
  pi: Pick<ExtensionAPI, 'sendUserMessage'>,
  modes: ModeController,
): readonly ToolDefinition[] {
  return [
    diffpiSetupTool,
    diffpiValidateTool,
    createDiffpiReloadTool(pi),
    diffpiTemplateTool,
    ...createModeTools(modes),
    ...createReviewTools(),
  ];
}
