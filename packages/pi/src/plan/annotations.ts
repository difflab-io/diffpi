import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { run } from '../extensions/processx';
import { withPlanLock } from './lock';
import { planAnnotationCommentSchema } from './schema';
import type { PlanAnnotationComment, PlanAnnotationState, PlanRecord } from './types';

export interface AnnotationProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface PlanAnnotationRuntime {
  execute?: (command: string, args: string[], cwd: string, interactive: boolean) => Promise<AnnotationProcessResult>;
}

export async function annotatePlan(
  record: PlanRecord,
  runtime: PlanAnnotationRuntime = {},
): Promise<{ sessionSlug: string; code: number; state: PlanAnnotationState }> {
  const execute = runtime.execute ?? executeProcess;
  const result = await execute('tuicr', ['--file', record.dir], record.dir, true);
  const sessionSlug = [...result.stderr.matchAll(/^tuicr-session:\s*(\S+)\s*$/gm)].at(-1)?.[1];
  if (result.code !== 0) throw new Error(result.stderr.trim() || `tuicr exited with status ${result.code}.`);
  if (!sessionSlug) throw new Error('tuicr did not report a tuicr-session marker.');
  const state = await withPlanLock(
    record.dir,
    async () => {
      const next: PlanAnnotationState = {
        schemaVersion: 1,
        sessionSlug,
        updatedAt: new Date().toISOString(),
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
  options: { runtime?: PlanAnnotationRuntime } = {},
): Promise<{
  state?: PlanAnnotationState;
  comments: PlanAnnotationComment[];
  pending: PlanAnnotationComment[];
  revisionPath?: string;
}> {
  const state = await readAnnotationState(record).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (!state) return { comments: [], pending: [] };
  if (state.exportedPlanRevision !== undefined && record.document.revision > state.exportedPlanRevision)
    return { state, comments: [], pending: [] };
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
  const comments = raw.map((value, index) => normalizeComment(value, index, lines));
  if (comments.length === 0) return { state, comments: [], pending: [] };
  const { nextState, revisionPath } = await withPlanLock(
    record.dir,
    async () => {
      const revisionPath = await exportPlanRevision(record, state.sessionSlug, comments);
      const nextState = {
        ...state,
        updatedAt: new Date().toISOString(),
        exportedPlanRevision: record.document.revision,
      };
      await atomicJson(annotationStatePath(record), nextState);
      return { nextState, revisionPath };
    },
    { operation: 'export plan annotations' },
  );
  return { state: nextState, comments, pending: comments, revisionPath };
}

export function annotationStatePath(record: PlanRecord): string {
  return join(record.dir, 'annotations.json');
}

async function readAnnotationState(record: PlanRecord): Promise<PlanAnnotationState> {
  const source = await readFile(annotationStatePath(record), 'utf8');
  let value: Partial<PlanAnnotationState>;
  try {
    value = JSON.parse(source) as Partial<PlanAnnotationState>;
  } catch {
    throw new Error(`Malformed annotation state: ${annotationStatePath(record)}.`);
  }
  if (
    value.schemaVersion !== 1 ||
    typeof value.sessionSlug !== 'string' ||
    (value.exportedPlanRevision !== undefined && !Number.isInteger(value.exportedPlanRevision))
  ) {
    throw new Error(`Malformed annotation state: ${annotationStatePath(record)}.`);
  }
  return value as PlanAnnotationState;
}

function normalizeComment(value: unknown, index: number, lines: string[]): PlanAnnotationComment {
  const parsed = planAnnotationCommentSchema.safeParse(value);
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
  };
}

async function exportPlanRevision(
  record: PlanRecord,
  sessionSlug: string,
  comments: PlanAnnotationComment[],
): Promise<string> {
  const revisionsDir = join(record.dir, 'revisions');
  const path = join(revisionsDir, `${record.document.revision}.md`);
  const annotations = comments
    .map((comment, index) => {
      const location = [comment.file, comment.line ? `line ${comment.line}` : undefined].filter(Boolean).join(':');
      const context = comment.context ? `\n\n**Original context:**\n\n\`\`\`\n${comment.context}\n\`\`\`` : '';
      return `### Annotation ${index + 1}: ${comment.id}\n\n${location ? `**Location:** ${location}\n\n` : ''}${comment.body}${context}`;
    })
    .join('\n\n');
  const source = `# Plan Revision ${record.document.revision}\n\n- **Plan:** ${record.id}\n- **Annotation session:** ${sessionSlug}\n\n## Original Plan\n\n\`\`\`\`markdown\n${record.source.trimEnd()}\n\`\`\`\`\n\n## Exported Annotations\n\n${annotations}\n`;
  await mkdir(revisionsDir, { recursive: true });
  await writeFile(path, source, { encoding: 'utf8', mode: 0o600 });
  return path;
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
