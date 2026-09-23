import type { ReviewDocInput } from './types';
import { dedupeFindings } from './types';

// API ------------------------------------------------------------------------

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
