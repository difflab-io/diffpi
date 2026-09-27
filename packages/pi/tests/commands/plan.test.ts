/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { registerPlanCommand } from '../../src/commands/plan';
import { registerReviewCommand } from '../../src/commands/review';

describe('skill command aliases', () => {
  for (const [name, register, skill] of [
    ['plan', registerPlanCommand, '/skill:plan'],
    ['review', registerReviewCommand, '/skill:review'],
  ] as const) {
    it(`forwards ${name} arguments unchanged`, async () => {
      let handler!: (args: string, ctx: unknown) => Promise<void>;
      const messages: unknown[] = [];
      const pi = {
        registerCommand(_name: string, command: { handler: typeof handler }) {
          handler = command.handler;
        },
        sendUserMessage(...message: unknown[]) {
          messages.push(message);
        },
      };
      register(pi as never, {} as never);

      const raw = '  --bg "quoted value" --invalid';
      await handler(raw, {});

      expect(messages).toEqual([[`${skill} ${raw}`, { deliverAs: 'followUp', expandPromptTemplates: true }]]);
    });

    it(`forwards empty ${name} arguments`, async () => {
      let handler!: (args: string, ctx: unknown) => Promise<void>;
      const messages: unknown[] = [];
      const pi = {
        registerCommand(_name: string, command: { handler: typeof handler }) {
          handler = command.handler;
        },
        sendUserMessage(...message: unknown[]) {
          messages.push(message);
        },
      };
      register(pi as never, {} as never);

      await handler('', {});

      expect(messages[0]).toEqual([skill, { deliverAs: 'followUp', expandPromptTemplates: true }]);
    });
  }
});
