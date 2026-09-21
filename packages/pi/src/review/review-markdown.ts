import { z } from 'zod';
import type { ReviewDocInput, ReviewThreadArtifactOptions, ReviewThreadRecord } from './types';
import { dedupeFindings } from './types';

const reviewThreadRecordSchema = z.object({
  id: z.string().min(1),
  file: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  line: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .transform((value) => value ?? undefined),
  body: z.string(),
  author: z.string().optional(),
  resolved: z.boolean(),
  addressed: z.boolean().optional(),
  question: z.boolean(),
  replies: z.array(z.string()).optional(),
});

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
    addressed: thread.addressed,
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
      `Status: ${thread.resolved ? 'resolved' : thread.addressed ? 'addressed' : 'open'}`,
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

export function upsertThreadReply(
  content: string,
  threadId: string,
  body: string,
  question?: boolean,
  resolved?: boolean,
): string {
  const threads = parseThreadArtifact(content);
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (!thread) throw new Error(`Review thread ${threadId} was not found in the local artifact.`);
  thread.reply = body;
  thread.addressed = true;
  if (question !== undefined) thread.question = question;
  if (resolved !== undefined) thread.resolved = resolved;
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
