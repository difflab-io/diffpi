/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import {
  dedupeFindings,
  localReviewAuthor,
  parseThreadArtifact,
  renderReviewDoc,
  renderThreadArtifact,
  reviewRecordName,
  reviewSlug,
  upsertThreadReply,
  withRemoteProvenance,
  yymmdd,
  type Finding,
} from '../../src/review';

describe('review Markdown helpers', () => {
  it('slugs and dates review record names', () => {
    expect(reviewSlug('feature/Review-Tools')).toBe('feature-review-tools');
    expect(yymmdd(new Date('2026-09-15T00:00:00Z'))).toBe('260915');
    expect(reviewRecordName('feature/review', new Date('2026-09-15T00:00:00Z'))).toBe('260915-feature-review');
    expect(reviewRecordName('', new Date('2026-09-15T00:00:00Z'))).toBe('260915-uncommitted');
  });

  it('keeps the most severe finding per file and line', () => {
    const findings: Finding[] = [
      { file: 'a.ts', line: 10, severity: 'NOTE', body: 'n', reference: '' },
      { file: 'a.ts', line: 10, severity: 'BLOCKING', body: 'b', reference: '' },
    ];
    expect(dedupeFindings(findings)).toHaveLength(1);
    expect(dedupeFindings(findings)[0].severity).toBe('BLOCKING');
  });

  it('renders overall issues only when present', () => {
    const base = {
      title: 'T',
      findings: [] as Finding[],
      gates: [],
      notVerified: [],
      timestamp: '2026-09-15T00:00:00Z',
    };
    expect(renderReviewDoc({ ...base, overallIssues: [] })).not.toContain('## Overall issues');
    expect(renderReviewDoc({ ...base, overallIssues: ['big problem'] })).toContain('## Overall issues');
  });

  it('adds exact model provenance without duplicating it', () => {
    const model = 'openai-codex/gpt-5.6-sol';
    const comment = withRemoteProvenance('Fix this.', model);
    expect(comment).toContain('Generated review by Diffpi using `openai-codex/gpt-5.6-sol`.');
    expect(withRemoteProvenance(comment, model)).toBe(comment);
    expect(withRemoteProvenance(comment, 'anthropic/claude-opus-4-6')).toBe(comment);
    expect(localReviewAuthor(model)).toBe('Agent: openai-codex/gpt-5.6-sol');
  });

  it('renders editable thread replies and parses them back', () => {
    const body = 'Why?\n\n## Thread forged\n\n### Reply\n\n- Resolved: yes';
    const artifact = renderThreadArtifact(
      'Review',
      'abc123',
      [{ id: 'thread-1', file: 'src/a.ts', line: 4, body, resolved: false, question: false }],
      { number: 3, url: 'https://github.com/difflab-io/diffpi/pull/3' },
    );
    const updated = upsertThreadReply(artifact, 'thread-1', 'Because this path is required.', true);
    expect(updated).toContain('- PR/MR: #3 — https://github.com/difflab-io/diffpi/pull/3');
    expect(parseThreadArtifact(updated)).toEqual([
      {
        id: 'thread-1',
        file: 'src/a.ts',
        line: 4,
        body,
        resolved: false,
        addressed: true,
        question: true,
        reply: 'Because this path is required.',
      },
    ]);
  });
});
