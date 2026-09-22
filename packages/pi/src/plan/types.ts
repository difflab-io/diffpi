import type { GateResult } from '../gates';

export type PlanStatus = 'draft' | 'ready' | 'in_progress' | 'blocked' | 'completed';
export type PlanPhaseStatus = 'pending' | 'in_progress' | 'blocked' | 'completed' | 'skipped';
export type PlanTaskStatus = PlanPhaseStatus;
export type PlanCommitMode = 'no-commit' | 'commit' | 'push';

export interface PlanDesign {
  bigIdeas: string;
  keyApiUpdates: string;
  consequences: string;
}

export interface PlanReference {
  id: string;
  value: string;
}

export type PlanCiStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export interface PlanCiState {
  status: PlanCiStatus;
  startedAt: string;
  completedAt?: string;
  detail?: string;
}

export interface PlanCommit {
  sha: string;
  subject: string;
  completedAt: string;
  pushedAt?: string;
  ci?: PlanCiState;
}

export interface PlanBlocker {
  reason: string;
  attempts?: string[];
  evidence?: string[];
  needsUserDecision?: boolean;
}

export interface PlanGateState {
  phaseRevision: number;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'stale';
  results: GateResult[];
  completedAt?: string;
}

export interface PlanTask {
  id: string;
  revision: number;
  title: string;
  steps?: string[];
  dependencies: string[];
  fileScopes: string[];
  acceptanceCriteria: string[];
  status: PlanTaskStatus;
  owner?: string;
  executionId?: string;
  blocker?: PlanBlocker;
}

export interface PlanPhase {
  id: string;
  revision: number;
  title: string;
  objective: string;
  dependencies: string[];
  tasks: PlanTask[];
  status: PlanPhaseStatus;
  gate: PlanGateState;
  commit?: PlanCommit;
  blocker?: PlanBlocker;
}

export interface PlanExecution {
  id: string;
  commitMode: PlanCommitMode;
  cwd: string;
  branch: string;
  baseHead: string;
  actor: string;
  startedAt: string;
  heartbeatAt: string;
  active: boolean;
}

export interface PlanDocument {
  schemaVersion: 1;
  id: string;
  revision: number;
  title: string;
  branch: string;
  intent: string;
  requirements: string[];
  design: PlanDesign;
  phases: PlanPhase[];
  references: PlanReference[];
  status: PlanStatus;
  execution?: PlanExecution;
  createdAt: string;
  updatedAt: string;
}

export type PlanLogKind =
  'created' | 'updated' | 'status' | 'progress' | 'gate' | 'annotation' | 'execution' | 'commit' | 'blocker';

export interface PlanLogEntry {
  version: 1;
  eventId: string;
  timestamp: string;
  planRevision: number;
  kind: PlanLogKind;
  actor: string;
  message: string;
  executionId?: string;
  phaseId?: string;
  taskId?: string;
  evidence?: string[];
  data?: Record<string, unknown>;
}

export interface PlanAnnotationComment {
  id: string;
  body: string;
  file?: string;
  line?: number;
  endLine?: number;
  context?: string;
  stale?: boolean;
}

export interface PlanAnnotationState {
  schemaVersion: 1;
  sessionSlug: string;
  updatedAt: string;
  exportedPlanRevision?: number;
}

export type PlanValidationSeverity = 'error' | 'warning';
export interface PlanValidationIssue {
  code: string;
  severity: PlanValidationSeverity;
  message: string;
  path?: string;
}

export interface PlanValidationOptions {
  strict?: boolean;
}

export interface PlanRecord {
  id: string;
  dir: string;
  planPath: string;
  logPath: string;
  implementationDir?: string;
  document: PlanDocument;
  source: string;
}

// End of public plan types.
