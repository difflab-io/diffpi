import { randomUUID } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';

export interface DiffpiLogEntry {
  version: 1;
  eventId: string;
  timestamp: string;
  kind: string;
  actor: string;
  message: string;
  correlation?: Record<string, string>;
  evidence?: string[];
  data?: Record<string, unknown>;
}

export type NewLogEntry<T extends DiffpiLogEntry = DiffpiLogEntry> = Omit<T, 'version' | 'eventId' | 'timestamp'> &
  Partial<Pick<T, 'eventId' | 'timestamp'>>;

export async function appendLogEntry<T extends DiffpiLogEntry>(logPath: string, event: NewLogEntry<T>): Promise<T> {
  const entry = {
    ...event,
    version: 1,
    eventId: event.eventId ?? randomUUID(),
    timestamp: event.timestamp ?? new Date().toISOString(),
  } as T;
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  return entry;
}

export async function readLogEntries<T extends DiffpiLogEntry>(logPath: string, label = 'Diffpi'): Promise<T[]> {
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
        return JSON.parse(line) as T;
      } catch {
        throw new Error(`Malformed ${label} log entry at line ${index + 1}.`);
      }
    });
}
