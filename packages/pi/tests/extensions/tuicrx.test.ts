/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { localResponseMarker } from '../../src/review';
import { toFindings, toLocalReviewThreads } from '../../src/extensions/tuicrx';

describe('toFindings', () => {
  it('maps line, file, and review comments to the forge shape', () => {
    const session = {
      branch_name: 'feature/review',
      review_comments: [{ content: 'Overall: looks good.' }],
      files: {
        'src/foo.ts': {
          file_comments: [{ content: 'Remove this file.', side: null }],
          line_comments: {
            '42': [{ content: 'Validate this input.', side: 'new' as const }],
            '7': [{ content: 'This was here before.', side: 'old' as const }],
          },
        },
      },
    };
    const { comments, body } = toFindings(session);
    expect(body).toBe('Overall: looks good.\n\nFile: src/foo.ts\n\nRemove this file.');
    expect(comments).toEqual(
      expect.arrayContaining([
        { file: 'src/foo.ts', line: 42, side: 'RIGHT', body: 'Validate this input.' },
        { file: 'src/foo.ts', line: 7, side: 'LEFT', body: 'This was here before.' },
      ]),
    );
  });

  it('returns empty results for an empty session', () => {
    expect(toFindings({})).toEqual({ comments: [], body: '' });
  });

  it('promotes only agent-authored comments when requested', () => {
    const session = {
      files: {
        'src/foo.ts': {
          line_comments: {
            '3': [
              { content: 'Existing remote comment.', username: 'reviewer' },
              { content: 'Local generated comment.', username: 'Agent: openai-codex/gpt-5.6-sol' },
            ],
          },
        },
      },
    };
    expect(toFindings(session, { agentOnly: true }).comments).toEqual([
      {
        file: 'src/foo.ts',
        line: 3,
        side: 'RIGHT',
        body: 'Local generated comment.',
        author: 'Agent: openai-codex/gpt-5.6-sol',
      },
    ]);
  });

  it('excludes local response comments from the publishable draft', () => {
    const session = {
      files: {
        'src/foo.ts': {
          line_comments: {
            '3': [
              { content: 'Finding.', username: 'Agent: openai-codex/gpt-5.6-sol' },
              {
                content: `${localResponseMarker('local-1')}\nAnswer.`,
                username: 'Agent: openai-codex/gpt-5.6-sol',
              },
            ],
          },
        },
      },
    };
    expect(toFindings(session, { agentOnly: true, excludeLocalResponses: true }).comments).toEqual([
      { file: 'src/foo.ts', line: 3, side: 'RIGHT', body: 'Finding.', author: 'Agent: openai-codex/gpt-5.6-sol' },
    ]);
  });
});

describe('toLocalReviewThreads', () => {
  it('returns review, file, and line comments as addressable threads', () => {
    const threads = toLocalReviewThreads({
      review_comments: [{ content: 'Overall concern?' }],
      files: {
        'src/foo.ts': {
          file_comments: [{ content: 'Remove this file.' }],
          line_comments: {
            '42': [
              { content: 'Validate this input.', side: 'new' },
              { content: `${localResponseMarker('local-1')}\nAlready answered.` },
            ],
          },
        },
      },
    });
    expect(threads).toEqual([
      { id: 'local-1', body: 'Overall concern?', resolved: false, question: true },
      { id: 'local-2', file: 'src/foo.ts', body: 'Remove this file.', resolved: false, question: false },
      {
        id: 'local-3',
        file: 'src/foo.ts',
        line: 42,
        body: 'Validate this input.',
        resolved: false,
        question: false,
      },
    ]);
  });
});
