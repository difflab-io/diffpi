import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { loadTemplate, renderTemplate } from '../templates';

const templateSchema = z.object({
  name: z.string().min(1),
  variables: z.record(z.string(), z.string()).optional(),
  homeDir: z.string().optional(),
});

export const diffpiTemplateTool: ToolDefinition = defineTool({
  name: 'diffpi_template',
  label: 'diffpi template',
  description: 'Load a bundled Diffpi template or a user override and render named variables.',
  promptSnippet: 'Use diffpi_template for package workflow templates',
  promptGuidelines: ['User overrides live under ~/.difflab/diffpi/templates.'],
  parameters: z.toJSONSchema(templateSchema, { io: 'input' }) as ToolDefinition['parameters'],
  executionMode: 'parallel',
  async execute(_id, input) {
    const params = templateSchema.parse(input);
    const template = await loadTemplate(params.name, { homeDir: params.homeDir });
    const content = renderTemplate(template.content, params.variables ?? {});
    return {
      content: [{ type: 'text' as const, text: content }],
      details: { name: params.name, path: template.path, source: template.source },
    };
  },
});
