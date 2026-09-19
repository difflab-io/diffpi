import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Register the extension reload command. */
export function registerReloadCommand(pi: ExtensionAPI): void {
  pi.registerCommand('diffpi-reload', {
    description: 'Reload extensions, skills, prompts, themes, and context files',
    handler: async (_args, ctx) => {
      await ctx.reload();
    },
  });
}
