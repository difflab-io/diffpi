/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { registerCommands } from '../../src/commands/index';

type Command = (args: string, ctx: unknown) => Promise<void>;

function harness() {
  const commands = new Map<string, Command>();
  const messages: Array<{ text: string; options: unknown }> = [];
  const hooks: string[] = [];
  const events: string[] = [];
  registerCommands({
    registerCommand(name: string, command: { handler: Command }) {
      commands.set(name, command.handler);
    },
    on(event: string) {
      hooks.push(event);
    },
    events: {
      emit(event: string) {
        events.push(event);
      },
    },
    sendUserMessage(text: string, options: unknown) {
      messages.push({ text, options });
    },
  } as never);
  return {
    commands,
    messages,
    hooks,
    events,
    async invoke(name: string, args: string) {
      const handler = commands.get(name);
      if (!handler) throw new Error(`Missing command ${name}`);
      await handler(args, {});
    },
  };
}

const expansion = { deliverAs: 'followUp', expandPromptTemplates: true };

describe('plan/review aliases', () => {
  for (const workflow of ['plan', 'review'] as const) {
    it(`forwards /${workflow} arguments intact for native skill expansion`, async () => {
      const h = harness();
      const args = `new --target="PR with spaces" --local --intent 'keep this exact'`;
      await h.invoke(workflow, args);
      expect(h.messages).toEqual([{ text: `/skill:diffpi-${workflow} ${args}`, options: expansion }]);
      expect(h.events).toEqual([]);
    });

    it(`routes missing /${workflow} arguments to the skill's help workflow`, async () => {
      const h = harness();
      await h.invoke(workflow, '');
      expect(h.messages).toEqual([{ text: `/skill:diffpi-${workflow}`, options: expansion }]);
      expect(h.events).toEqual([]);
    });

    it(`does not reject fuzzy input or flags for /${workflow}`, async () => {
      const h = harness();
      const args = `Could you help me with this? --unknown="value with spaces"`;
      await h.invoke(workflow, args);
      expect(h.messages).toEqual([{ text: `/skill:diffpi-${workflow} ${args}`, options: expansion }]);
    });
  }

  it('does not intercept direct skill input or duplicate forwarded dispatch', async () => {
    const h = harness();
    expect(h.hooks).not.toContain('input');
    expect(h.commands.has('skill:plan')).toBe(false);
    expect(h.commands.has('skill:review')).toBe(false);
    await h.invoke('plan', 'go --mode push');
    expect(h.messages).toHaveLength(1);
    expect(h.events).toEqual([]);
  });
});
