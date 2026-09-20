import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { chmod, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { plansDir } from '../store';

export interface BackgroundPacketLimits {
  maxMessages?: number;
  maxBytes?: number;
  retentionMs?: number;
}

export interface BackgroundPacketPayload {
  version: 1;
  command: Record<string, unknown>;
  cwd: string;
  branch: string;
  conversation: Array<{ role: 'user' | 'assistant'; text: string }>;
  createdAt: string;
}

export interface LaunchBackgroundPiOptions {
  name: string;
  agentPath: string;
  model: string;
  thinking: string;
  cwd: string;
  prompt: string;
  packetPath?: string;
}

/** Delegate scheduling to pi-background-tasks through its `/bg --agent` command. */
export async function launchBackgroundPi(
  pi: Pick<ExtensionAPI, 'sendUserMessage'>,
  options: LaunchBackgroundPiOptions,
): Promise<{ name: string; command: string; queued: true }> {
  const child = shellCommand([
    'pi',
    '--mode',
    'json',
    '--print',
    '--no-session',
    '--offline',
    '--approve',
    '--model',
    options.model,
    '--thinking',
    options.thinking,
    '--append-system-prompt',
    options.agentPath,
    '--',
    options.prompt,
  ]);
  const command = options.packetPath
    ? `sh -c ${shellQuote(`trap 'rm -f -- "$1"' EXIT HUP INT TERM; cd -- "$2" || exit; ${child}`)} sh ${shellQuote(options.packetPath)} ${shellQuote(options.cwd)}`
    : `cd ${shellQuote(options.cwd)} && ${child}`;
  await pi.sendUserMessage(`/bg --agent --name ${shellQuote(options.name)} -- ${command}`, {
    deliverAs: 'followUp',
    expandPromptTemplates: true,
  });
  return { name: options.name, command, queued: true };
}

export async function createBackgroundPacket(
  cwd: string,
  payload: Omit<BackgroundPacketPayload, 'version' | 'createdAt'>,
  limits: BackgroundPacketLimits = {},
): Promise<string> {
  const root = await plansDir(cwd);
  const temp = join(root, '.tmp');
  await mkdir(temp, { recursive: true, mode: 0o700 });
  await cleanupBackgroundPackets(temp, limits.retentionMs);
  const packet: BackgroundPacketPayload = { ...payload, version: 1, createdAt: new Date().toISOString() };
  const content = `${JSON.stringify(packet)}\n`;
  const maxBytes = limits.maxBytes ?? 64 * 1024;
  if (Buffer.byteLength(content) > maxBytes) throw new Error(`Background packet exceeds ${maxBytes} bytes.`);
  const path = join(temp, `context-${crypto.randomUUID()}.json`);
  await writeFile(path, content, { mode: 0o600, flag: 'wx' });
  await chmod(path, 0o600);
  return path;
}

export function normalizeConversation(
  entries: readonly unknown[],
  maxMessages = 12,
  maxBytes = 48 * 1024,
): Array<{ role: 'user' | 'assistant'; text: string }> {
  const messages = entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as { type?: unknown; message?: unknown; secret?: unknown };
    if (
      candidate.secret === true ||
      candidate.type !== 'message' ||
      !candidate.message ||
      typeof candidate.message !== 'object'
    )
      return [];
    const message = candidate.message as { role?: unknown; content?: unknown };
    if (message.role !== 'user' && message.role !== 'assistant') return [];
    const text = messageText(message.content);
    return text ? [{ role: message.role as 'user' | 'assistant', text }] : [];
  });
  const selected = messages.slice(-Math.max(0, maxMessages));
  while (Buffer.byteLength(JSON.stringify(selected)) > maxBytes && selected.length) selected.shift();
  return selected;
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function shellCommand(args: readonly string[]): string {
  return args.map(shellQuote).join(' ');
}

async function cleanupBackgroundPackets(dir: string, retentionMs = 24 * 60 * 60 * 1000): Promise<void> {
  const cutoff = Date.now() - retentionMs;
  for (const name of await readdir(dir)) {
    if (!/^context-[a-f0-9-]+\.json$/i.test(name)) continue;
    const path = join(dir, name);
    if ((await stat(path)).mtimeMs < cutoff) await rm(path, { force: true });
  }
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const candidate = part as { type?: unknown; text?: unknown; source?: unknown };
      return candidate.type === 'text' && typeof candidate.text === 'string' && candidate.source !== 'secret'
        ? [candidate.text]
        : [];
    })
    .join('\n')
    .trim();
}
