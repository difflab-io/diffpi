export type ReviewSide = 'LEFT' | 'RIGHT';
export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export interface ReviewComment {
  file: string;
  line: number;
  side?: ReviewSide;
  body: string;
  author?: string;
}

export interface ReviewDraft {
  comments: ReviewComment[];
  body: string;
}

export interface ReviewThreadRecord {
  id: string;
  file?: string;
  line?: number;
  body: string;
  author?: string;
  resolved: boolean;
  question: boolean;
  reply?: string;
  replies?: string[];
}

export interface ReviewReply {
  threadId: string;
  body: string;
  resolve: boolean;
  question?: boolean;
}

export interface ReviewBackend {
  readonly kind: 'local' | 'remote';
  stage(draft: ReviewDraft): Promise<void>;
  readDraft(): Promise<ReviewDraft>;
  listThreads(): Promise<ReviewThreadRecord[]>;
  reply(input: ReviewReply): Promise<void>;
  publish(event: ReviewEvent): Promise<void>;
}

export interface LocalReviewBackendOptions {
  session: string;
  artifactPath: string;
  author: string;
}

export interface ReviewThreadArtifactOptions {
  timestamp?: string;
  number?: number;
  url?: string;
}
