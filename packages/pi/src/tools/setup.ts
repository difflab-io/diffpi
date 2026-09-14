import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { setupPi, type SetupResult } from '../setup';

const parameters = Type.Object({
  issueTracker: Type.Optional(
    Type.String({
      description: 'Issue tracker MCP server to configure. Use none unless the user explicitly selects Linear or Jira.',
      enum: ['none', 'linear', 'jira'],
      default: 'none',
    }),
  ),
  installMiseHook: Type.Optional(
    Type.Boolean({
      description:
        'Add the mise activation hook to the current shell configuration. Set false only when the user declines.',
      default: true,
    }),
  ),
});

export interface ToolDetails {
  changed?: boolean;
  result?: SetupResult;
}

export const diffpiSetupTool: ToolDefinition<typeof parameters, ToolDetails> = defineTool({
  name: 'diffpi_setup',
  label: 'diffpi setup',
  description:
    'Install or repair the @difflab/pi environment. This mutates user-level tool installations and configuration files.',
  promptSnippet: 'Install or repair @difflab/pi only after the user approves the setup choices',
  promptGuidelines: [
    'Call this tool only when the user explicitly asks to install, configure, or repair the environment.',
    'Use ask_user_question for unspecified setup choices before calling this tool.',
    'Use issueTracker="none" unless the user explicitly selects Linear or Jira.',
    'Use diffpi_validate instead when the user asks only to inspect or verify setup.',
  ],
  parameters,
  executionMode: 'sequential',
  async execute(_toolCallId, params, _signal, onUpdate) {
    const result = await setupPi({
      issueTracker: parseIssueTracker(params.issueTracker),
      installMiseHook: params.installMiseHook ?? true,
      onProgress(message) {
        onUpdate?.({ content: [{ type: 'text', text: message }], details: {} });
      },
    });

    return formatResult(result, 'Setup complete.');
  },
});

export const diffpiValidateTool: ToolDefinition<typeof parameters, ToolDetails> = defineTool({
  name: 'diffpi_validate',
  label: 'diffpi validate',
  description: 'Inspect the @difflab/pi environment without installing software or changing configuration files.',
  promptSnippet: 'Validate @difflab/pi safely before setup or when the user asks for an environment check',
  promptGuidelines: [
    'Prefer this tool before diffpi_setup when the requested action is unclear.',
    'This tool is read-only. Do not describe planned actions as completed changes.',
    'Use issueTracker="none" unless the user explicitly asks to validate Linear or Jira configuration.',
  ],
  parameters,
  executionMode: 'sequential',
  async execute(_toolCallId, params) {
    const result = await setupPi({
      issueTracker: parseIssueTracker(params.issueTracker),
      installMiseHook: params.installMiseHook ?? true,
      dryRun: true,
    });
    const incomplete = result.actions.some((item) => item.status === 'planned');
    return formatResult(result, incomplete ? 'Setup is incomplete.' : 'Setup is ready.');
  },
});

function parseIssueTracker(value: string | undefined): 'none' | 'linear' | 'jira' {
  if (!value || value === 'none') return 'none';
  if (value === 'linear' || value === 'jira') return value;
  throw new Error(`Unknown issue tracker: ${value}`);
}

function formatResult(result: SetupResult, heading: string) {
  const changed = result.actions.some(
    (item) => item.status === 'installed' || item.status === 'updated' || item.status === 'planned',
  );
  const lines = result.actions.map((item) => `${item.status.padEnd(9)} ${item.name}: ${item.detail}`);
  if (result.restartPi) lines.push('Restart pi to load package, skill, and MCP changes.');

  return {
    content: [{ type: 'text' as const, text: `${heading}\n\n${lines.join('\n')}` }],
    details: { changed, result },
  };
}
