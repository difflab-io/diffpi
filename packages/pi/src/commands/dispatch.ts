import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Alias only: the namespaced package skill cannot be shadowed by a generic global skill. */
export function forwardWorkflow(pi: ExtensionAPI, workflow: 'plan' | 'review', args: string): void {
  pi.sendUserMessage(`/skill:diffpi-${workflow}${args ? ` ${args}` : ''}`, {
    deliverAs: 'followUp',
    expandPromptTemplates: true,
  });
}
