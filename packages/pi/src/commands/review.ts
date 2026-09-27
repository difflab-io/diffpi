import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
/** Register the review skill alias without interpreting its arguments. */
export function registerReviewCommand(pi: ExtensionAPI): void {
  pi.registerCommand('review', {
    description: 'Code review (delegated to the review skill)',
    handler: async (args) => {
      pi.sendUserMessage(`/skill:review${args ? ` ${args}` : ''}`, {
        deliverAs: 'followUp',
        expandPromptTemplates: true,
      });
    },
  });
}
