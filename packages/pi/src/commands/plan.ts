import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
/** Register the plan skill alias without interpreting its arguments. */
export function registerPlanCommand(pi: ExtensionAPI): void {
  pi.registerCommand('plan', {
    description: 'Durable planning (delegated to the plan skill)',
    handler: async (args) => {
      pi.sendUserMessage(`/skill:plan${args ? ` ${args}` : ''}`, {
        deliverAs: 'followUp',
        expandPromptTemplates: true,
      });
    },
  });
}
