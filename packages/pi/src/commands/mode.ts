import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ModeController } from '../modes';

const MODE_USAGE =
  '/mode [agent|default|clear|reset]\n\nUse /mode to pick a profile. Available profiles: copilot, orchestrator, reviewer, tutor, worker.';

/** Register the inline agent mode command. */
export function registerModeCommand(pi: ExtensionAPI, modes: ModeController): void {
  pi.registerCommand('mode', {
    description: 'Select or clear a Diffpi inline agent profile',
    handler: async (args, ctx) => handleModeCommand(args, ctx, modes),
  });
}

async function handleModeCommand(args: string, ctx: ExtensionContext, modes: ModeController): Promise<void> {
  const requested = args.trim();
  if (requested === 'help' || requested === '-h' || requested === '--help') {
    ctx.ui.notify(MODE_USAGE, 'info');
    return;
  }
  if (!requested) {
    const catalog = await modes.list(ctx);
    const selected = await ctx.ui.select('Diffpi mode', ['default', ...catalog.modes.map((mode) => mode.id)]);
    if (!selected) return;
    const result = selected === 'default' ? await modes.unset(ctx) : await modes.set(selected, ctx);
    ctx.ui.notify(`${result.message} Changes apply on the next turn.`, result.ok ? 'info' : 'error');
    return;
  }
  if (/\s/.test(requested)) {
    ctx.ui.notify(MODE_USAGE, 'error');
    return;
  }
  const result =
    requested === 'default' || requested === 'clear' || requested === 'reset'
      ? await modes.unset(ctx)
      : await modes.set(requested, ctx);
  ctx.ui.notify(`${result.message} Changes apply on the next turn.`, result.ok ? 'info' : 'error');
}
