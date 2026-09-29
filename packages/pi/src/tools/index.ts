import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { watchCiTool } from './ci';
import { diffpiLogTool } from './log';
import { diffpiDoctorTool } from './doctor';
import { planVerifyTool } from './plan';
import { createDiffpiReloadTool } from './reload';
import { createReviewTools } from './review';
import { diffpiSetupTool, diffpiValidateTool } from './setup';
import { diffpiTemplateTool } from './templates';

// Exports ---------------------------------------------------------------------

export { watchCiTool } from './ci';
export { diffpiLogTool } from './log';
export { diffpiDoctorTool } from './doctor';
export { planVerifyTool } from './plan';
export { createDiffpiReloadTool } from './reload';
export { createReviewTools } from './review';
export { diffpiSetupTool, diffpiValidateTool } from './setup';
export { diffpiTemplateTool } from './templates';

// Tool catalog ----------------------------------------------------------------

export function createPiTools(pi: Pick<ExtensionAPI, 'events' | 'sendUserMessage'>): readonly ToolDefinition[] {
  return [
    diffpiSetupTool,
    diffpiValidateTool,
    diffpiDoctorTool,
    createDiffpiReloadTool(pi),
    diffpiLogTool,
    diffpiTemplateTool,
    planVerifyTool,
    watchCiTool,
    ...createReviewTools(),
  ];
}
