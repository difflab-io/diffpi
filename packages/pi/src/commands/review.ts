import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { forwardWorkflow } from './dispatch';

/** /review is only a shortcut for Pi's native /skill:review expansion. */
export function registerReviewCommand(pi: ExtensionAPI): void {
  pi.registerCommand('review', {
    description: 'Open the review skill',
    handler: async (args) => {
      forwardWorkflow(pi, 'review', args);
    },
  });
}
