/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTemplate, renderTemplate, templateRelativePath } from '../src/templates';

describe('template registry', () => {
  it('loads the bundled review template and renders variables', async () => {
    const template = await loadTemplate('review/draft-pr', {
      homeDir: join(await mkdtemp(join(tmpdir(), 'diffpi-home-')), 'home'),
    });
    expect(template.source).toBe('bundled');
    expect(
      renderTemplate(template.content, { intent: 'Ship reviews', head: 'feature/review', base: 'main' }),
    ).toContain('Ship reviews');
  });

  it('prefers a user override under the namespaced template directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'diffpi-home-'));
    const path = join(home, '.difflab', 'diffpi', 'templates', 'review', 'draft-pr.md');
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'Intent: {{intent}}\n', 'utf8');
    const template = await loadTemplate('review/draft-pr', { homeDir: home });
    expect(template.source).toBe('user');
    expect(renderTemplate(template.content, { intent: 'Override' })).toBe('Intent: Override\n');
  });

  it('rejects template paths outside the registry', () => {
    expect(() => templateRelativePath('../secret')).toThrow('Invalid template name');
  });
});
