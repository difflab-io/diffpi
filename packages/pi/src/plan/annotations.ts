import { spawn } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { run } from '../extensions/processx';
import { appendPlanLog } from './log';
import { withPlanLock } from './lock';
import type { PlanAnnotationComment, PlanAnnotationState, PlanRecord } from './types';

export interface AnnotationProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface PlanAnnotationRuntime {
  execute?: (command: string, args: string[], cwd: string, interactive: boolean) => Promise<AnnotationProcessResult>;
}

const commentSchema = z
  .object({
    id: z.string(),
    content: z.string(),
    path: z.string().optional(),
    start_line: z.number().int().optional(),
    line: z.number().int().optional(),
    end_line: z.number().int().optional(),
  })
  .loose();

export async function annotatePlan(
  record: PlanRecord,
  runtime: PlanAnnotationRuntime = {},
): Promise<{ sessionSlug: string; code: number; state: PlanAnnotationState }> {
  const execute = runtime.execute ?? executeProcess;
  const result = await execute('tuicr', ['--file', record.planPath], dirname(record.planPath), true);
  const sessionSlug = [...result.stderr.matchAll(/^tuicr-session:\s*(\S+)\s*$/gm)].at(-1)?.[1];
  if (result.code !== 0) throw new Error(result.stderr.trim() || `tuicr exited with status ${result.code}.`);
  if (!sessionSlug) throw new Error('tuicr did not report a tuicr-session marker.');
  const state = await withPlanLock(
    record.dir,
    async () => {
      const previous = await readAnnotationState(record).catch(() => undefined);
      const next: PlanAnnotationState = {
        schemaVersion: 1,
        sessionSlug,
        updatedAt: new Date().toISOString(),
        appliedCommentIds: previous?.appliedCommentIds ?? [],
      };
      await atomicJson(annotationStatePath(record), next);
      return next;
    },
    { operation: 'save annotation session' },
  );
  return { sessionSlug, code: result.code, state };
}

export async function readPlanAnnotations(
  record: PlanRecord,
  options: { includeApplied?: boolean; runtime?: PlanAnnotationRuntime } = {},
): Promise<{ state?: PlanAnnotationState; comments: PlanAnnotationComment[]; pending: PlanAnnotationComment[] }> {
  const state = await readAnnotationState(record).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (!state) return { comments: [], pending: [] };
  const execute = options.runtime?.execute ?? executeProcess;
  const response = await execute('tuicr', ['review', 'comments', '--session', state.sessionSlug], record.dir, false);
  if (response.code !== 0) {
    if (/not found|no session|deleted/i.test(response.stderr)) return { state, comments: [], pending: [] };
    throw new Error(response.stderr.trim() || 'Cannot read tuicr comments.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(response.stdout);
  } catch {
    throw new Error('tuicr returned malformed comment JSON.');
  }
  if (!Array.isArray(raw)) throw new Error('tuicr comment output must be a JSON array.');
  const lines = record.source.split('\n');
  const applied = new Set(state.appliedCommentIds);
  const comments = raw.map((value, index) => normalizeComment(value, index, lines, applied));
  const pending = comments.filter((comment) => !comment.applied);
  return { state, comments: options.includeApplied ? comments : pending, pending };
}

export async function acknowledgePlanAnnotations(
  record: PlanRecord,
  commentIds: readonly string[],
  summary: string,
): Promise<PlanAnnotationState> {
  if (!summary.trim()) throw new Error('Annotation acknowledgement summary is required.');
  return withPlanLock(
    record.dir,
    async () => {
      const state = await readAnnotationState(record);
      const next: PlanAnnotationState = {
        ...state,
        updatedAt: new Date().toISOString(),
        appliedCommentIds: [...new Set([...state.appliedCommentIds, ...commentIds])],
      };
      await atomicJson(annotationStatePath(record), next);
      await appendPlanLog(record.logPath, {
        planRevision: record.document.revision,
        kind: 'annotation',
        actor: 'planner',
        message: summary,
        data: { commentIds: [...commentIds], sessionSlug: state.sessionSlug },
      });
      return next;
    },
    { operation: 'acknowledge annotations' },
  );
}

export function annotationStatePath(record: PlanRecord): string {
  return join(record.dir, 'annotations.json');
}

async function readAnnotationState(record: PlanRecord): Promise<PlanAnnotationState> {
  let value: Partial<PlanAnnotationState>;
  try {
    value = JSON.parse(await readFile(annotationStatePath(record), 'utf8')) as Partial<PlanAnnotationState>;
  } catch {
    throw new Error(`Malformed annotation state: ${annotationStatePath(record)}.`);
  }
  if (value.schemaVersion !== 1 || typeof value.sessionSlug !== 'string' || !Array.isArray(value.appliedCommentIds)) {
    throw new Error(`Malformed annotation state: ${annotationStatePath(record)}.`);
  }
  return value as PlanAnnotationState;
}

function normalizeComment(
  value: unknown,
  index: number,
  lines: string[],
  applied: ReadonlySet<string>,
): PlanAnnotationComment {
  const parsed = commentSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Malformed tuicr comment at index ${index}.`);
  const raw = parsed.data;
  const line = raw.start_line ?? raw.line;
  const endLine = raw.end_line ?? line;
  const targetPath = raw.path;
  const appliesToPlan = !targetPath || basename(targetPath) === basename('PLAN.md');
  const validAnchor = appliesToPlan && line !== undefined && line > 0 && line <= lines.length;
  return {
    id: raw.id,
    body: raw.content,
    file: targetPath,
    line,
    endLine,
    context: validAnchor ? lines.slice(line - 1, Math.min(endLine ?? line, lines.length)).join('\n') : undefined,
    stale: line !== undefined && !validAnchor,
    applied: applied.has(raw.id),
  };
}

async function executeProcess(
  command: string,
  args: string[],
  cwd: string,
  interactive: boolean,
): Promise<AnnotationProcessResult> {
  if (!interactive) {
    const result = await run(command, args, { cwd, capture: 'unbounded' });
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['inherit', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout: '', stderr }));
  });
}

async function atomicJson(path: string, value: unknown): Promise<void> {
  const temp = join(dirname(path), `.${basename(path)}.${crypto.randomUUID()}.tmp`);
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}
