import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Package assets --------------------------------------------------------------

export function resolveBundledAssetDir(name: string, moduleUrl = import.meta.url): string {
  const moduleDir = dirname(fileURLToPath(moduleUrl));
  const candidates = [join(moduleDir, name), join(moduleDir, '..', name), join(moduleDir, '..', '..', name)];
  return candidates.find((path) => existsSync(path)) ?? candidates[1];
}

export function resolveBundledAgentsDir(moduleUrl = import.meta.url): string {
  return resolveBundledAssetDir('agents', moduleUrl);
}

export function resolveBundledTemplatesDir(moduleUrl = import.meta.url): string {
  return resolveBundledAssetDir('templates', moduleUrl);
}

export function resolveBundledWorkflowsDir(moduleUrl = import.meta.url): string {
  return resolveBundledAssetDir('workflows', moduleUrl);
}
