/// <reference types="bun" />
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'bun:test';
import { registerReviewCommand } from '../../src/commands/review';

describe('review command', () => {
  it('loads package workflows and selects the owning agent', async () => {
    let handler!: (args: string, ctx: any) => Promise<void>;
    const selected: string[] = [];
    const messages: Array<{ content: string }> = [];
    const pi = {
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
      sendMessage(message: { content: string }) {
        messages.push(message);
      },
    };
    registerReviewCommand(
      pi as any,
      {
        set: async (agent: string) => {
          selected.push(agent);
          return { ok: true, message: '' };
        },
      } as any,
    );

    await handler('address 12 --local', { cwd: '/tmp' });
    await handler('publish 12 --approve', { cwd: '/tmp' });

    expect(selected).toEqual(['reviewer', 'orchestrator']);
    expect(messages[0]!.content).toContain('/workflows/review');
    expect(messages[0]!.content).toContain('"target": "12"');
    expect(messages[0]!.content).toContain('"local": true');
    expect(messages[0]!.content).toContain('review_dump');
    expect(messages[1]!.content).toContain('# publish');
  });

  it('normalizes aliases and preserves typed options', async () => {
    let handler!: (args: string, ctx: any) => Promise<void>;
    const messages: Array<{ content: string }> = [];
    const pi = {
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
      sendMessage(message: { content: string }) {
        messages.push(message);
      },
    };
    registerReviewCommand(pi as any, { set: async () => ({ ok: true, message: '' }) } as any);

    await handler('launch --local', { cwd: '/tmp' });
    await handler('create My review --intent "Explain the change" --base main', { cwd: '/tmp' });
    expect(messages[0]!.content).toContain('# auto');
    expect(messages[0]!.content).toContain('"local": true');
    expect(messages[1]!.content).toContain('# new');
    expect(messages[1]!.content).toContain('"title": "My review"');
    expect(messages[1]!.content).toContain('"intent": "Explain the change"');
    expect(messages[1]!.content).toContain('"base": "main"');
  });

  it('shows generated cmd-ts help for invalid input', async () => {
    let handler!: (args: string, ctx: any) => Promise<void>;
    const notices: string[] = [];
    const pi = {
      registerCommand(_name: string, command: { handler: typeof handler }) {
        handler = command.handler;
      },
    };
    registerReviewCommand(pi as any, { set: async () => ({ ok: true, message: '' }) } as any);

    const context = {
      cwd: '/tmp',
      ui: { notify: (message: string) => notices.push(message) },
    };
    await handler('unknown', context);
    await handler('publish --local', context);

    expect(notices).toHaveLength(2);
    expect(notices[0]).toContain('review <subcommand>');
    expect(notices[0]).toContain('auto');
    expect(notices[1]).toContain('Unknown arguments');
  });
});
