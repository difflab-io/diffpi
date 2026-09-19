import { readFile, writeFile } from 'node:fs/promises';
import { addComment, readSession, toFindings } from '../extensions/tuicrx';
import { parseThreadArtifact, upsertThreadReply } from './review-markdown';
import type { LocalReviewBackendOptions, ReviewBackend } from './types';

export function LocalReviewBackend(options: LocalReviewBackendOptions): ReviewBackend {
  return {
    kind: 'local',
    async stage(draft) {
      for (const comment of draft.comments) {
        await addComment(options.session, comment.body, {
          targetFile: comment.file,
          line: comment.line,
          side: comment.side === 'LEFT' ? 'old' : 'new',
          username: options.author,
        });
      }
      if (draft.body.trim()) await addComment(options.session, draft.body, { username: options.author });
    },
    async readDraft() {
      return toFindings(await readSession(options.session), { agentOnly: true, excludeLocalResponses: true });
    },
    async listThreads() {
      try {
        return parseThreadArtifact(await readFile(options.artifactPath, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    },
    async reply(input) {
      const content = await readFile(options.artifactPath, 'utf8');
      await writeFile(
        options.artifactPath,
        upsertThreadReply(content, input.threadId, input.body, input.question, input.resolve),
        'utf8',
      );
    },
    async publish() {
      throw new Error('Promote a local draft through a remote review backend before publishing it.');
    },
  };
}
