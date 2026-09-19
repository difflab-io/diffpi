import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';
import { registerModeCommand } from './mode';
import { registerReloadCommand } from './reload';
import { registerReviewCommand } from './review';

/** Register the extension's user-facing commands. */
export function registerCommands(pi: ExtensionAPI, modes: ModeController): void {
  registerReloadCommand(pi);
  registerModeCommand(pi, modes);
  registerReviewCommand(pi, modes);
}

export { registerModeCommand } from './mode';
export { registerReloadCommand } from './reload';
export { registerReviewCommand } from './review';
