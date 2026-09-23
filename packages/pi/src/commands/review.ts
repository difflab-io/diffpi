import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  command,
  dryRun,
  flag,
  option,
  optional,
  positional,
  restPositionals,
  string,
  subcommands,
} from '../extensions/cmdtsx';
import { generateCommandHelp, tokenizeCommandArgs, type WorkflowAgent, type WorkflowRuntime } from '../commands';
import { launchBackgroundAgent } from '../extensions/subagentx';
import type { ModeController } from '../modes';
import { loadReviewWorkflow, type ReviewWorkflowArguments, type ReviewWorkflowName } from '../workflow';

// Types ----------------------------------------------------------------------

type ReviewWorkflowInvocation = {
  [Name in ReviewWorkflowName]: {
    workflow: Name;
    arguments: ReviewWorkflowArguments[Name];
    agent: WorkflowAgent;
    isBackground?: boolean;
  };
}[ReviewWorkflowName];

// API ------------------------------------------------------------------------

export function registerReviewCommand(pi: ExtensionAPI, modes: ModeController): void {
  pi.registerCommand('review', {
    description: 'Code review: auto, new, edit, address, publish, complete, merge, help',
    handler: async (args, ctx) => runReviewCommand(args, { pi, ctx, modes }),
  });
}

// Core -----------------------------------------------------------------------

async function runReviewCommand(raw: string, runtime: WorkflowRuntime): Promise<void> {
  try {
    const reviewCommand = createReviewCommand(runtime);
    const parsed = await dryRun(reviewCommand, tokenizeCommandArgs(raw));
    if (parsed._tag === 'error') throw new Error(parsed.error);
  } catch (error) {
    const help = await generateCommandHelp(createReviewCommand(runtime));
    runtime.ctx.ui.notify(`${error instanceof Error ? error.message : String(error)}\n${help}`, 'error');
  }
}

function createReviewCommand(runtime: WorkflowRuntime) {
  const invokeWorkflow = createReviewWorkflowInvoker(runtime);
  const auto = command({
    name: 'auto',
    args: { target: targetArgument(), local: flag({ long: 'local' }), background: flag({ long: 'bg' }) },
    handler: async ({ target, local, background }) =>
      invokeWorkflow({
        workflow: 'auto',
        arguments: { target, local, background },
        agent: 'reviewer',
        isBackground: background,
      }),
  });
  const create = command({
    name: 'new',
    args: {
      intent: option({ long: 'intent', type: optional(string), defaultValue: () => undefined }),
      base: option({ long: 'base', type: optional(string), defaultValue: () => undefined }),
      local: flag({ long: 'local' }),
      background: flag({ long: 'bg' }),
      title: restPositionals({ type: string }),
    },
    handler: async ({ title, intent, base, local, background }) =>
      invokeWorkflow({
        workflow: 'new',
        arguments: { title: title.length ? title.join(' ') : undefined, intent, base, local, background },
        agent: 'orchestrator',
        isBackground: background,
      }),
  });
  const edit = command({
    name: 'edit',
    args: { target: targetArgument(), local: flag({ long: 'local' }), background: flag({ long: 'bg' }) },
    handler: async ({ target, local, background }) =>
      invokeWorkflow({
        workflow: 'edit',
        arguments: { target, local, background },
        agent: 'orchestrator',
        isBackground: background,
      }),
  });
  const address = command({
    name: 'address',
    args: { target: targetArgument(), local: flag({ long: 'local' }), background: flag({ long: 'bg' }) },
    handler: async ({ target, local, background }) =>
      invokeWorkflow({
        workflow: 'address',
        arguments: { target, local, background },
        agent: 'reviewer',
        isBackground: background,
      }),
  });
  const publish = command({
    name: 'publish',
    args: {
      target: targetArgument(),
      comment: flag({ long: 'comment' }),
      approve: flag({ long: 'approve' }),
      requestChanges: flag({ long: 'request-changes' }),
      close: flag({ long: 'close' }),
      background: flag({ long: 'bg' }),
    },
    handler: async ({ target, comment, approve, requestChanges, close, background }) =>
      invokeWorkflow({
        workflow: 'publish',
        arguments: { target, comment, approve, requestChanges, close, background },
        agent: 'orchestrator',
        isBackground: background,
      }),
  });
  const complete = command({
    name: 'complete',
    args: {
      target: targetArgument(),
      local: flag({ long: 'local' }),
      approve: flag({ long: 'approve' }),
      reject: flag({ long: 'reject' }),
      abandon: flag({ long: 'abandon' }),
      background: flag({ long: 'bg' }),
    },
    handler: async ({ target, local, approve, reject, abandon, background }) =>
      invokeWorkflow({
        workflow: 'complete',
        arguments: { target, local, approve, reject, abandon, background },
        agent: 'orchestrator',
        isBackground: background,
      }),
  });
  const merge = command({
    name: 'merge',
    args: { target: targetArgument(), background: flag({ long: 'bg' }) },
    handler: async ({ target, background }) =>
      invokeWorkflow({
        workflow: 'merge',
        arguments: { target, background },
        agent: 'orchestrator',
        isBackground: background,
      }),
  });
  const help = command({
    name: 'help',
    args: {},
    handler: async () => invokeWorkflow({ workflow: 'help', arguments: {}, agent: 'orchestrator' }),
  });
  return subcommands({
    name: 'review',
    cmds: {
      auto,
      new: create,
      edit,
      address,
      publish,
      complete,
      merge,
      help,
      open: create,
      create,
      draft: create,
      launch: auto,
      ready: publish,
      close: complete,
      land: merge,
    },
  });
}

function createReviewWorkflowInvoker(runtime: WorkflowRuntime) {
  return async function invokeWorkflow(invocation: ReviewWorkflowInvocation): Promise<void> {
    const { workflow, arguments: args, agent, isBackground = false } = invocation;
    const prompt = await loadReviewWorkflow(workflow, args);
    if (isBackground) {
      await launchBackgroundAgent(runtime.pi.events, {
        name: `Review ${workflow}`,
        agent: 'orchestrator',
        cwd: runtime.ctx.cwd,
        inheritContext: true,
        prompt,
      });
      return;
    }
    const activation = await runtime.modes.set(agent, runtime.ctx);
    runtime.pi.sendMessage(
      {
        customType: `diffpi-review-${workflow}-command`,
        display: false,
        content: `${prompt}\n\n${activation.message}`,
      },
      { triggerTurn: true },
    );
  };
}

// Utils ----------------------------------------------------------------------

function targetArgument() {
  return positional({ type: optional(string), displayName: 'target' });
}
