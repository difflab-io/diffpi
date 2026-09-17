/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { toFindings } from '../src/tuicr';

describe('tuicr toFindings', () => {
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
    expect(comments).not.toContainEqual({ file: 'src/foo.ts', line: 1, side: 'RIGHT', body: 'Remove this file.' });
  });

  it('returns empty results for an empty session', () => {
    expect(toFindings({})).toEqual({ comments: [], body: '' });
  });
});
