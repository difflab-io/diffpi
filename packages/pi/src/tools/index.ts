import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';
import { createDiffpiReloadTool } from './reload';
import { createModeTools } from './modes';
import { diffpiSetupTool, diffpiValidateTool } from './setup';

// Exports ---------------------------------------------------------------------

export { createDiffpiReloadTool } from './reload';
export { createModeTools } from './modes';
export { diffpiSetupTool, diffpiValidateTool } from './setup';

// Tool catalog ----------------------------------------------------------------

export function createPiTools(
  pi: Pick<ExtensionAPI, 'sendUserMessage'>,
  modes: ModeController,
): readonly ToolDefinition[] {
  return [diffpiSetupTool, diffpiValidateTool, createDiffpiReloadTool(pi), ...createModeTools(modes)];
}
