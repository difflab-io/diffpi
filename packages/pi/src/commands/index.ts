import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerPlanCommand } from './plan';
import { registerReloadCommand } from './reload';
import { registerReviewCommand } from './review';

/** Register the extension's user-facing commands. */
export function registerCommands(pi: ExtensionAPI): void {
  registerReloadCommand(pi);
  registerReviewCommand(pi);
  registerPlanCommand(pi);
}

export { registerPlanCommand } from './plan';
export { registerReloadCommand } from './reload';
export { registerReviewCommand } from './review';
