import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';
import { registerModeCommand } from './mode';
import { registerPlanCommand } from './plan';
import { registerReloadCommand } from './reload';
import { registerReviewCommand } from './review';

/** Register the extension's user-facing commands. */
export function registerCommands(pi: ExtensionAPI, modes: ModeController): void {
  registerReloadCommand(pi);
  registerModeCommand(pi, modes);
  registerReviewCommand(pi);
  registerPlanCommand(pi);
}

export { registerModeCommand } from './mode';
export { registerPlanCommand } from './plan';
export { registerReloadCommand } from './reload';
export { registerReviewCommand } from './review';
