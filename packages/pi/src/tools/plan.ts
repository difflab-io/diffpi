import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { verifyLivePlan } from '../plan/verify';

const schema = z.object({ plan: z.string().min(1), cwd: z.string().optional() }).strict();

/** Mechanical checks only; independent human-quality review remains required. */
export const planVerifyTool: ToolDefinition = defineTool({
  name: 'plan_verify',
  label: 'plan verify',
  description:
    'Verify the live PLAN.md and numbered briefs for structural and task parity errors without changing files or state.',
  promptSnippet:
    'Run plan_verify on the current live files before requesting Plan Reviewer judgment or marking a plan READY.',
  promptGuidelines: [
    'A PASS checks structure only. It never replaces the independent high-tier Plan Reviewer or approves execution.',
  ],
  parameters: z.toJSONSchema(schema, { io: 'input' }) as ToolDefinition['parameters'],
  executionMode: 'parallel',
  async execute(_id, input) {
    const params = schema.parse(input);
    const result = await verifyLivePlan(params.plan, params.cwd);
    const text = result.ok
      ? `PASS: ${result.planPath} and ${result.briefPaths.length} numbered brief(s) pass mechanical checks. Semantic Plan Reviewer approval is still required.`
      : result.issues.map(({ file, line, code, message }) => `${file}:${line} [${code}] ${message}`).join('\n');
    return { content: [{ type: 'text' as const, text }], details: result };
  },
});
