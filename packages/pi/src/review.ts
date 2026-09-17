import { z } from 'zod';
import type { GateResult } from './gates';
import type { ReviewComment, ReviewThreadArtifactOptions, ReviewThreadRecord } from './review-types';

export type { ReviewThreadArtifactOptions, ReviewThreadRecord } from './review-types';

// Schemas and types -----------------------------------------------------------

export const severitySchema = z.enum(['BLOCKING', 'CONSIDER', 'NOTE']);
export type Severity = z.infer<typeof severitySchema>;

export const findingSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().nonnegative(),
  severity: severitySchema,
  body: z.string().min(1),
  reference: z.string().optional().default(''),
});
export type Finding = z.infer<typeof findingSchema>;
export const findingsSchema = z.array(findingSchema);

const reviewThreadRecordSchema = z.object({
  id: z.string().min(1),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  body: z.string(),
  author: z.string().optional(),
  resolved: z.boolean(),
  question: z.boolean(),
  replies: z.array(z.string()).optional(),
});

export interface ReviewDocInput {
  title: string;
  number?: number;
  url?: string;
  author?: string;
  model?: string;
  baseRef?: string;
  headRef?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  findings: Finding[];
  overallIssues: string[];
  gates: GateResult[];
  notVerified: string[];
  timestamp?: string;
}

// Naming ----------------------------------------------------------------------

export function reviewSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function yymmdd(date = new Date()): string {
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

export function reviewRecordName(target: string, date = new Date()): string {
  return `${yymmdd(date)}-${reviewSlug(target) || 'local'}`;
}

// Findings --------------------------------------------------------------------

export function dedupeFindings(findings: Finding[]): Finding[] {
  const rank = { BLOCKING: 3, CONSIDER: 2, NOTE: 1 } satisfies Record<Severity, number>;
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}`;
    const existing = byKey.get(key);
    if (!existing || rank[finding.severity] > rank[existing.severity]) byKey.set(key, finding);
  }
  return [...byKey.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || rank[b.severity] - rank[a.severity],
  );
}

export function toReviewComments(findings: Finding[], model?: string): ReviewComment[] {
  const comments: ReviewComment[] = [];
  for (const finding of findings) {
    if (finding.line <= 0) continue;
    const body = renderCommentBody(finding);
    comments.push({
      file: finding.file,
      line: finding.line,
      side: 'RIGHT',
      body: model ? withRemoteProvenance(body, model) : body,
    });
  }
  return comments;
}

export function withRemoteProvenance(body: string, model: string): string {
  const normalized = body.trimEnd();
  if (/Generated review by Diffpi using `[^`]+`\.$/.test(normalized)) return body;
  return `${normalized}\n\nGenerated review by Diffpi using \`${model}\`.`;
}

export function localReviewAuthor(model: string): string {
  return `Agent: ${model}`;
}

// Documents -------------------------------------------------------------------

export function renderReviewDoc(input: ReviewDocInput): string {
  const anchored = dedupeFindings(input.findings).filter((finding) => finding.line > 0);
  const lines: string[] = [`# Review: ${input.title}`, '', '## Metadata'];
  if (input.number !== undefined) lines.push(`- **PR/MR**: #${input.number}${input.url ? ` — ${input.url}` : ''}`);
  if (input.author) lines.push(`- **Author**: ${input.author}`);
  if (input.model) lines.push(`- **Review agent**: ${input.model}`);
  if (input.headRef && input.baseRef) lines.push(`- **Branch**: ${input.headRef} → ${input.baseRef}`);
  if (input.additions !== undefined)
    lines.push(`- **Stats**: +${input.additions} -${input.deletions ?? 0} across ${input.changedFiles ?? 0} files`);
  lines.push(`- **Reviewed**: ${input.timestamp ?? new Date().toISOString()}`, '');
  if (input.overallIssues.length > 0) {
    lines.push('## Overall issues', '');
    for (const issue of input.overallIssues) lines.push(`- ${issue}`);
    lines.push('');
  }
  lines.push('## Verification', '');
  for (const gate of input.gates) lines.push(`- ${gate.name}: ${gate.status} — ${gate.detail}`);
  lines.push('');
  if (input.notVerified.length > 0) {
    lines.push('## What was NOT verified', '');
    for (const item of input.notVerified) lines.push(`- ${item}`);
    lines.push('');
  }
  lines.push('## Inline Comments', '');
  for (const finding of anchored) {
    lines.push(`### ${finding.file}:${finding.line} — ${finding.severity}`, '', finding.body, '');
    if (finding.reference) lines.push(`> **Reference:** ${finding.reference}`, '');
    lines.push('---', '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderThreadArtifact(
  title: string,
  target: string,
  threads: readonly ReviewThreadRecord[],
  options: ReviewThreadArtifactOptions = {},
): string {
  const records = threads.map((thread) => ({
    id: thread.id,
    file: thread.file,
    line: thread.line,
    body: thread.body,
    author: thread.author,
    resolved: thread.resolved,
    question: thread.question,
    replies: thread.replies,
  }));
  const payload = Buffer.from(JSON.stringify(records), 'utf8').toString('base64url');
  const lines = [
    `<!-- diffpi-threads:${payload} -->`,
    `# Review threads: ${title}`,
    '',
    '## Metadata',
    '',
    `- Target: ${target}`,
    `- Pulled: ${options.timestamp ?? new Date().toISOString()}`,
  ];
  if (options.number !== undefined) lines.push(`- PR/MR: #${options.number}${options.url ? ` — ${options.url}` : ''}`);
  lines.push('', '## Replies', '');
  for (const thread of threads) {
    const id = Buffer.from(thread.id, 'utf8').toString('base64url');
    lines.push(
      `### ${thread.file ?? 'review'}:${thread.line ?? 'n/a'} (${thread.id})`,
      '',
      `<!-- diffpi-reply-start:${id} -->`,
      thread.reply ?? '',
      `<!-- diffpi-reply-end:${id} -->`,
      '',
    );
  }
  lines.push('## Source comments', '');
  for (const thread of threads) {
    lines.push(
      `### ${thread.file ?? 'review'}:${thread.line ?? 'n/a'} — ${thread.author ?? 'unknown'}`,
      '',
      `Thread: ${thread.id}`,
      '',
      thread.body,
      '',
      '---',
      '',
    );
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function parseThreadArtifact(content: string): ReviewThreadRecord[] {
  const payload = content.match(/^<!-- diffpi-threads:([A-Za-z0-9_-]+) -->$/m)?.[1];
  if (!payload) throw new Error('This file is not a Diffpi thread artifact.');
  let threads: Array<Omit<ReviewThreadRecord, 'reply'>>;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    threads = z.array(reviewThreadRecordSchema).parse(decoded);
  } catch {
    throw new Error('Cannot parse the Diffpi thread artifact payload.');
  }
  const replies = content.split(/^## Source comments$/m, 1)[0] ?? '';
  return threads.map((thread) => {
    const id = Buffer.from(thread.id, 'utf8').toString('base64url');
    const startMarker = `<!-- diffpi-reply-start:${id} -->\n`;
    const endMarker = `\n<!-- diffpi-reply-end:${id} -->`;
    const start = replies.indexOf(startMarker);
    const end = start < 0 ? -1 : replies.indexOf(endMarker, start + startMarker.length);
    const reply = start >= 0 && end >= 0 ? replies.slice(start + startMarker.length, end).trim() : '';
    return reply ? { ...thread, reply } : thread;
  });
}

export function upsertThreadReply(content: string, threadId: string, body: string, question?: boolean): string {
  const threads = parseThreadArtifact(content);
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new Error(`Review thread ${threadId} was not found in the local artifact.`);
  thread.reply = body;
  if (question !== undefined) thread.question = question;
  const title = content.match(/^# Review threads: (.+)$/m)?.[1] ?? 'review';
  const target = content.match(/^- Target: (.+)$/m)?.[1] ?? 'local';
  const timestamp = content.match(/^- Pulled: (.+)$/m)?.[1];
  const pr = content.match(/^- PR\/MR: #(\d+)(?: — (.+))?$/m);
  return renderThreadArtifact(title, target, threads, {
    timestamp,
    number: pr ? Number.parseInt(pr[1], 10) : undefined,
    url: pr?.[2],
  });
}

// Utils -----------------------------------------------------------------------

function renderCommentBody(finding: Finding): string {
  const prefix = finding.severity === 'BLOCKING' ? '**BLOCKING** ' : '';
  const reference = finding.reference ? `\n\n> **Reference:** ${finding.reference}` : '';
  return `${prefix}${finding.body}${reference}`;
}
