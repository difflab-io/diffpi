import type { VcsInfo } from '../environment';
import { GitHubVcsBackend } from './github';
import { GitLabVcsBackend } from './gitlab';
import type { VcsBackend } from './types';

export function createForgeBackend(vcs: VcsInfo): VcsBackend {
  if (vcs.provider === 'github') return GitHubVcsBackend(vcs);
  if (vcs.provider === 'gitlab') return GitLabVcsBackend(vcs);
  throw new Error('No supported forge detected from the git remote. Use --local for an offline review.');
}

/** Compatibility names retained for consumers of the former forge API. */
export const createVcsBackend = createForgeBackend;
export const createForge = createForgeBackend;
