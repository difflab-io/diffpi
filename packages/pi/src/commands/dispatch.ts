import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Alias only: Pi expands the skill for the calling agent, including its help route. */
export function forwardWorkflow(pi: ExtensionAPI, workflow: 'plan' | 'review', args: string): void {
  pi.sendUserMessage(`/skill:${workflow}${args ? ` ${args}` : ''}`, {
    deliverAs: 'followUp',
    expandPromptTemplates: true,
  });
}
