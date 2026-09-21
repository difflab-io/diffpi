import { appendLogEntry, readLogEntries, type DiffpiLogEntry, type NewLogEntry } from '../log';
import type { PlanLogEntry } from './types';

export type NewPlanLogEntry = NewLogEntry<PlanLogEntry & DiffpiLogEntry>;

export async function appendPlanLog(logPath: string, event: NewPlanLogEntry): Promise<PlanLogEntry> {
  return appendLogEntry<PlanLogEntry & DiffpiLogEntry>(logPath, event);
}

export async function readPlanLog(logPath: string): Promise<PlanLogEntry[]> {
  return readLogEntries<PlanLogEntry & DiffpiLogEntry>(logPath, 'plan');
}
