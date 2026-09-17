import { join } from 'node:path';
import { z } from 'zod';
import type { ReviewComment } from './forge';
import type { GateResult } from './gates';

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

export function reviewSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export function mmddyy(date = new Date()): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `${mm}${dd}${yy}`;
}

export function reviewRecordName(branch: string, date = new Date()): string {
  return `${mmddyy(date)}-${reviewSlug(branch)}`;
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const rank: Record<Severity, number> = { BLOCKING: 3, CONSIDER: 2, NOTE: 1 };
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

export function toReviewComments(findings: Finding[]): ReviewComment[] {
  return findings
    .filter((finding) => finding.line > 0)
    .map((finding) => ({
      file: finding.file,
      line: finding.line,
      side: 'RIGHT',
      body: renderCommentBody(finding),
    }));
}

export interface ReviewDocInput {
  title: string;
  number?: number;
  url?: string;
  author?: string;
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

export function renderReviewDoc(input: ReviewDocInput): string {
  const anchored = dedupeFindings(input.findings).filter((finding) => finding.line > 0);
  const lines: string[] = [`# Review: ${input.title}`, '', '## Metadata'];
  if (input.number !== undefined) lines.push(`- **PR/MR**: #${input.number}${input.url ? ` — ${input.url}` : ''}`);
  if (input.author) lines.push(`- **Author**: ${input.author}`);
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

export function renderPrBody(intent: string, changes: string[], validation: string[]): string {
  const lines = ['## Intent', '', intent, '', '## Changes', ''];
  for (const change of changes) lines.push(`- ${change}`);
  lines.push('', '## Validation', '');
  for (const step of validation) lines.push(`- [ ] ${step}`);
  lines.push('- [ ] Existing tests pass', '');
  return `${lines.join('\n').trimEnd()}\n`;
}

export function reviewWorkingDir(storeReviewsDir: string, slug: string): string {
  return join(storeReviewsDir, slug);
}

function renderCommentBody(finding: Finding): string {
  const prefix = finding.severity === 'BLOCKING' ? '**BLOCKING** ' : '';
  const reference = finding.reference ? `\n\n> **Reference:** ${finding.reference}` : '';
  return `${prefix}${finding.body}${reference}`;
}
