/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { githubReviewSubmissionEndpoint, hasGitlabDraftNotes, parseGitlabDiffRefs } from '../src/forge';

describe('forge review helpers', () => {
  it('requires all GitLab diff refs for positioned draft notes', () => {
    expect(
      parseGitlabDiffRefs(JSON.stringify({ diff_refs: { base_sha: 'base', start_sha: 'start', head_sha: 'head' } })),
    ).toEqual({ base_sha: 'base', start_sha: 'start', head_sha: 'head' });
    expect(() => parseGitlabDiffRefs(JSON.stringify({ diff_refs: { head_sha: 'head' } }))).toThrow(
      'merge request diff refs are unavailable',
    );
  });

  it('detects whether GitLab has draft notes to publish', () => {
    expect(hasGitlabDraftNotes('[]')).toBe(false);
    expect(hasGitlabDraftNotes('[{"id":1}]')).toBe(true);
  });

  it('submits a GitHub review directly when no pending review exists', () => {
    expect(githubReviewSubmissionEndpoint('difflab', 'pi', 12, '')).toBe('/repos/difflab/pi/pulls/12/reviews');
    expect(githubReviewSubmissionEndpoint('difflab', 'pi', 12, '34')).toBe(
      '/repos/difflab/pi/pulls/12/reviews/34/events',
    );
  });
});
