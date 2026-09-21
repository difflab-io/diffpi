import type { ForgeProvider } from '../environment';

export interface PrRef {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  baseRef: string;
  headRef: string;
  headSha?: string;
}

export type HostedCiStatus = 'passed' | 'failed' | 'pending' | 'skipped';

export interface HostedCiResult {
  status: HostedCiStatus;
  detail: string;
}

export interface OpenPrOptions {
  title: string;
  body: string;
  base: string;
  head: string;
  draft?: boolean;
}

/** Hosted VCS lifecycle operations. CLI execution is isolated in extensions/*x. */
export interface VcsBackend {
  readonly provider: Exclude<ForgeProvider, 'none'>;
  createDraftPr(options: OpenPrOptions): Promise<PrRef>;
  viewPr(idOrBranch: string): Promise<PrRef | undefined>;
  defaultBranch(): Promise<string>;
  prDiff(id: number): Promise<string>;
  prChecks(id: number): Promise<HostedCiResult>;
  watchCommitCi(sha: string, options: { intervalSeconds: number; signal?: AbortSignal }): Promise<HostedCiResult>;
  markReady(id: number): Promise<void>;
  closePr(id: number, comment?: string): Promise<void>;
  mergePr(id: number, subject: string): Promise<void>;
}

/** Compatibility name retained for consumers of the former forge API. */
export type Forge = VcsBackend;
