/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { assertRenderedReviewBody } from '../../src/tools/review';

describe('review_new body validation', () => {
  it('rejects unresolved template placeholders', () => {
    expect(() => assertRenderedReviewBody('Issue: {{issue_url}}')).toThrow(/unresolved template/);
  });

  it('rejects placeholder HTML comments', () => {
    expect(() => assertRenderedReviewBody('<!-- List the checks that were run. -->')).toThrow(/HTML comments/);
  });

  it('accepts a fully rendered body', () => {
    expect(() =>
      assertRenderedReviewBody(
        '## Intent\nShip reviews\n\n## Changes\nAdd a draft tool\n\n## Validation\n- [x] Tests pass\n\n## References\n- Issue: LIN-1\n\n## Further Work\nNone identified.',
      ),
    ).not.toThrow();
  });
});
