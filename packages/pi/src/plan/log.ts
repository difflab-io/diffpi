import { randomUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import type { PlanLogEntry } from './types';

export type NewPlanLogEntry = Omit<PlanLogEntry, 'version' | 'eventId' | 'timestamp'> &
  Partial<Pick<PlanLogEntry, 'eventId' | 'timestamp'>>;

export async function appendPlanLog(logPath: string, event: NewPlanLogEntry): Promise<PlanLogEntry> {
  const entry: PlanLogEntry = {
    ...event,
    version: 1,
    eventId: event.eventId ?? randomUUID(),
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  return entry;
}

export async function readPlanLog(logPath: string): Promise<PlanLogEntry[]> {
  let source: string;
  try {
    source = await readFile(logPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return source
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as PlanLogEntry;
      } catch {
        throw new Error(`Malformed plan log entry at line ${index + 1}.`);
      }
    });
}
