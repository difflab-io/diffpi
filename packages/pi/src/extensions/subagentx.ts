import type { EventBus } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';

export interface LaunchBackgroundAgentOptions {
  name: string;
  agent: 'planner' | 'orchestrator';
  cwd: string;
  prompt: string;
  inheritContext?: boolean;
}

export interface SubagentCorrelation {
  workflow: string;
  executionId?: string;
  unitId?: string;
  parentUnitId?: string;
  metadata?: Record<string, string>;
}

export interface SubagentEscalation {
  correlation: SubagentCorrelation;
  blocker: string;
  attempts: string[];
  evidence: string[];
  needsUserDecision: boolean;
}

type RpcReply = { success: true; data?: unknown } | { success: false; error: string };

const escalationSchema: z.ZodType<SubagentEscalation> = z
  .object({
    correlation: z
      .object({
        workflow: z.string().min(1),
        executionId: z.string().min(1).optional(),
        unitId: z.string().min(1).optional(),
        parentUnitId: z.string().min(1).optional(),
        metadata: z.record(z.string(), z.string()).optional(),
      })
      .strict(),
    blocker: z.string().min(1),
    attempts: z.array(z.string()),
    evidence: z.array(z.string()),
    needsUserDecision: z.boolean(),
  })
  .strict();

const ESCALATION_OPEN = '<diffpi-subagent-escalation>';
const ESCALATION_CLOSE = '</diffpi-subagent-escalation>';

/** Spawn one detached top-level agent through @tintinweb/pi-subagents public RPC v2. */
export async function launchBackgroundAgent(
  events: EventBus,
  options: LaunchBackgroundAgentOptions,
): Promise<{ name: string; taskId: string; queued: true }> {
  const ping = await rpc(events, 'ping', {}, 1500);
  if (!ping.success) throw new Error(`pi-subagents unavailable: ${ping.error}`);
  if ((ping.data as { version?: unknown } | undefined)?.version !== 2)
    throw new Error('pi-subagents RPC version 2 is required for background execution.');

  const reply = await rpc(events, 'spawn', {
    type: options.agent,
    prompt: options.prompt,
    options: {
      name: options.name,
      description: options.name,
      cwd: options.cwd,
      isBackground: true,
      inheritContext: options.inheritContext ?? false,
    },
  });
  if (!reply.success) throw new Error(`pi-subagents spawn failed: ${reply.error}`);
  const taskId = (reply.data as { id?: unknown } | undefined)?.id;
  if (typeof taskId !== 'string' || !taskId) throw new Error('pi-subagents spawn returned no task id.');
  return { name: options.name, taskId, queued: true };
}

export function renderSubagentEscalation(value: SubagentEscalation): string {
  return `${ESCALATION_OPEN}${JSON.stringify(escalationSchema.parse(value))}${ESCALATION_CLOSE}`;
}

export function parseSubagentEscalation(output: string): SubagentEscalation {
  const start = output.indexOf(ESCALATION_OPEN);
  const end = output.indexOf(ESCALATION_CLOSE, start + ESCALATION_OPEN.length);
  if (start < 0 || end < 0 || output.indexOf(ESCALATION_OPEN, start + ESCALATION_OPEN.length) >= 0)
    throw new Error('Missing or ambiguous subagent escalation payload.');
  try {
    return escalationSchema.parse(JSON.parse(output.slice(start + ESCALATION_OPEN.length, end)));
  } catch (error) {
    throw new Error(`Malformed subagent escalation payload: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function rpc(
  events: EventBus,
  method: 'ping' | 'spawn',
  payload: Record<string, unknown>,
  timeout = 5000,
): Promise<RpcReply> {
  const requestId = crypto.randomUUID();
  const replyEvent = `subagents:rpc:${method}:reply:${requestId}`;
  return new Promise((resolve, reject) => {
    const unsubscribe = events.on(replyEvent, (data: unknown) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(data as RpcReply);
    });
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for pi-subagents ${method} RPC reply.`));
    }, timeout);
    events.emit(`subagents:rpc:${method}`, { requestId, ...payload });
  });
}
