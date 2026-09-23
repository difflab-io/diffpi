import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  command,
  dryRun,
  flag,
  oneOf,
  option,
  optional,
  positional,
  restPositionals,
  string,
  subcommands,
} from 'cmd-ts';
import { createWorkflowInvoker, generateCommandHelp, tokenizeCommandArgs, type WorkflowRuntime } from '../commands';
import type { ModeController } from '../modes';

// API -------------------------------------------------------------------------

export function registerPlanCommand(pi: ExtensionAPI, modes: ModeController): void {
  pi.registerCommand('plan', {
    description: 'Durable planning: init, new, update, annotate, finalize, go, help',
    handler: async (args, ctx) => runPlanCommand(args, { pi, ctx, modes }),
  });
}

// Core ------------------------------------------------------------------------

async function runPlanCommand(raw: string, runtime: WorkflowRuntime): Promise<void> {
  try {
    const command = createPlanCommand(runtime);
    const parsed = await dryRun(command, tokenizeCommandArgs(raw));
    if (parsed._tag === 'error') throw new Error(parsed.error);
  } catch (error) {
    const help = await generateCommandHelp(createPlanCommand(runtime));
    runtime.ctx.ui.notify(`${error instanceof Error ? error.message : String(error)}\n${help}`, 'error');
  }
}

function createPlanCommand(runtime: WorkflowRuntime) {
  const invokeWorkflow = createWorkflowInvoker(runtime);
  return subcommands({
    name: 'plan',
    cmds: {
      init: command({
        name: 'init',
        args: { plan: positional({ type: string }), branch: branchOption() },
        handler: async ({ plan, branch }) => {
          await invokeWorkflow({
            workflow: 'init',
            arguments: { plan, branch },
            agent: 'planner',
          });
        },
      }),
      new: command({
        name: 'new',
        args: {
          plan: positional({ type: string }),
          branch: branchOption(),
          background: flag({ long: 'bg' }),
          instructions: restPositionals({ type: string }),
        },
        handler: async ({ plan, branch, background, instructions }) => {
          await invokeWorkflow({
            workflow: 'new',
            arguments: { plan, branch, background, prompt: instructions.length ? instructions.join(' ') : undefined },
            agent: 'planner',
            isBackground: background,
          });
        },
      }),
      update: command({
        name: 'update',
        args: {
          plan: positional({ type: optional(string) }),
          branch: branchOption(),
          background: flag({ long: 'bg' }),
          instructions: restPositionals({ type: string }),
        },
        handler: async ({ plan, branch, background, instructions }) => {
          await invokeWorkflow({
            workflow: 'update',
            arguments: {
              plan,
              branch,
              background,
              instructions: instructions.length ? instructions.join(' ') : undefined,
            },
            agent: 'planner',
            isBackground: background,
          });
        },
      }),
      annotate: command({
        name: 'annotate',
        args: { plan: positional({ type: optional(string) }) },
        handler: async ({ plan }) =>
          invokeWorkflow({
            workflow: 'annotate',
            arguments: { plan },
            agent: 'worker',
          }),
      }),
      finalize: command({
        name: 'finalize',
        args: { plan: positional({ type: optional(string) }) },
        handler: async ({ plan }) =>
          invokeWorkflow({
            workflow: 'finalize',
            arguments: { plan },
            agent: 'worker',
          }),
      }),
      go: command({
        name: 'go',
        args: {
          plan: positional({ type: string }),
          background: flag({ long: 'bg' }),
          commitMode: option({
            long: 'mode',
            type: oneOf(['no-commit', 'commit', 'push'] as const),
            defaultValue: () => 'no-commit' as const,
          }),
        },
        handler: async ({ plan, background, commitMode }) => {
          await invokeWorkflow({
            workflow: 'go',
            arguments: { plan, commitMode, background },
            agent: 'orchestrator',
            isBackground: background,
          });
        },
      }),
      help: command({
        name: 'help',
        args: {},
        handler: async () => invokeWorkflow({ workflow: 'help', arguments: {}, agent: 'worker' }),
      }),
    },
  });
}

// Utils -----------------------------------------------------------------------

function branchOption() {
  return option({ long: 'branch', type: optional(string), defaultValue: () => undefined });
}
