import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { forwardWorkflow } from './dispatch';

/** /plan is only a shortcut for Pi's native /skill:plan expansion. */
export function registerPlanCommand(pi: ExtensionAPI): void {
  pi.registerCommand('plan', {
    description: 'Open the plan skill',
    handler: async (args) => {
      forwardWorkflow(pi, 'plan', args);
    },
  });
}
