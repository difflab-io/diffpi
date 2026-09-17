/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { checkConventionalSubject } from '../src/gates';
import { dedupeFindings, mmddyy, renderReviewDoc, reviewRecordName, reviewSlug, type Finding } from '../src/review';
import { conventionalMergeGuard } from '../src/tools/review';

describe('review helpers', () => {
  it('slugs and dates a review record name', () => {
    expect(reviewSlug('feature/Review-Tools')).toBe('feature-review-tools');
    expect(mmddyy(new Date('2026-09-15T00:00:00Z'))).toBe('091526');
    expect(reviewRecordName('feature/review', new Date('2026-09-15T00:00:00Z'))).toBe('091526-feature-review');
  });

  it('keeps the most severe finding per file:line', () => {
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

  it('validates conventional-commit subjects', () => {
    expect(checkConventionalSubject('feat: add review').status).toBe('pass');
    expect(checkConventionalSubject('add review').status).toBe('warn');
  });

  it('blocks merge subjects that are not conventional commits', () => {
    expect(conventionalMergeGuard('feat: add review').status).toBe('pass');
    expect(conventionalMergeGuard('add review').status).not.toBe('pass');
  });
});
