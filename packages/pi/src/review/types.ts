import { z } from 'zod';
import type { GateResult } from '../gates';

export type ReviewSide = 'LEFT' | 'RIGHT';
export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface ReviewComment {
  file: string;
  line?: number;
  side?: ReviewSide;
  body: string;
}

export interface ReviewDraft {
  comments: ReviewComment[];
  body: string;
}

export interface ReviewThreadRecord {
  id: string;
  file?: string;
  line?: number;
  body: string;
  author?: string;
  resolved: boolean;
  question: boolean;
  replies?: string[];
}

export interface ReviewReply {
  threadId: string;
  body: string;
  resolve: boolean;
  question?: boolean;
}

export interface ReviewBackend {
  stage(draft: ReviewDraft): Promise<void>;
  listThreads(): Promise<ReviewThreadRecord[]>;
  reply(input: ReviewReply): Promise<void>;
  publish(event: ReviewEvent): Promise<void>;
}

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
  return `${yymmdd(date)}-${reviewSlug(target) || 'uncommitted'}`;
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

// Utils -----------------------------------------------------------------------

function renderCommentBody(finding: Finding): string {
  const prefix = finding.severity === 'BLOCKING' ? '**BLOCKING** ' : '';
  const reference = finding.reference ? `\n\n> **Reference:** ${finding.reference}` : '';
  return `${prefix}${finding.body}${reference}`;
}
