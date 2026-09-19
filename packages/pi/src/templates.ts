import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, normalize } from 'node:path';
import { resolveBundledTemplatesDir } from './assets';

// Types -----------------------------------------------------------------------

export interface TemplateRegistryOptions {
  homeDir?: string;
  bundledDir?: string;
}

export interface LoadedTemplate {
  name: string;
  path: string;
  source: 'user' | 'bundled';
  content: string;
}

// API -------------------------------------------------------------------------

export async function loadTemplate(name: string, options: TemplateRegistryOptions = {}): Promise<LoadedTemplate> {
  const relative = templateRelativePath(name);
  const userPath = join(options.homeDir ?? homedir(), '.difflab', 'diffpi', 'templates', relative);
  const bundledPath = join(options.bundledDir ?? resolveBundledTemplatesDir(), relative);
  const user = await readOptionalFile(userPath);
  if (user !== undefined) return { name, path: userPath, source: 'user', content: user };
  const bundled = await readOptionalFile(bundledPath);
  if (bundled !== undefined) return { name, path: bundledPath, source: 'bundled', content: bundled };
  throw new Error(`Template "${name}" was not found at ${userPath} or ${bundledPath}.`);
}

export function renderTemplate(content: string, variables: Readonly<Record<string, string>>): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match);
}

export function templateRelativePath(name: string): string {
  const normalized = normalize(name.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || normalized.startsWith('/')) {
    throw new Error(`Invalid template name: ${name}`);
  }
  return normalized.endsWith('.md') ? normalized : `${normalized}.md`;
}

// Utils -----------------------------------------------------------------------

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
