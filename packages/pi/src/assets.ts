import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package assets --------------------------------------------------------------

export function resolveBundledAgentsDir(moduleUrl = import.meta.url): string {
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const candidates = [
    join(moduleDir, 'agents'),
    join(moduleDir, '..', 'agents'),
    join(moduleDir, '..', '..', 'agents'),
  ];
  return candidates.find((path) => existsSync(path)) ?? candidates[1];
}
