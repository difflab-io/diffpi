/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlanCliCommand } from '../../src/cli/plan';

function output() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write: (value: string) => ((stdout += value), true) },
      stderr: { write: (value: string) => ((stderr += value), true) },
    },
    read: () => ({ stdout, stderr }),
  };
}

describe('plan CLI', () => {
  it('opens a live plan file for human review without saving a snapshot or review', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-cli-plan-'));
    try {
      const dir = join(root, '.diffpi', 'plan', '260919-demo');
      await mkdir(dir, { recursive: true });
      const path = join(dir, 'PLAN.md');
      await writeFile(path, '# Demo\n\n- **Status:** draft\n');
      const calls: unknown[] = [];
      const capture = output();
      const runtime = {
        execute: async (...args: unknown[]) => {
          calls.push(args);
          return { code: 0, stdout: '', stderr: '' };
        },
      };
      await createPlanCliCommand(capture.io, runtime).parseAsync(['node', 'plan', 'annotate', dir, '--cwd', root]);
      expect(calls).toEqual([['tuicr', ['--file', path], root, true]]);
      expect(capture.read().stdout).toBe(`Opened ${path} in tuicr; no managed review was saved.\n`);
      expect(await Bun.file(path).text()).toContain('**Status:** draft');
      expect(await Bun.file(join(dir, 'reviews', '0.json')).exists()).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires an existing PLAN.md file or directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'diffpi-cli-plan-'));
    try {
      const bad = join(root, 'notes.md');
      await writeFile(bad, 'notes');
      const capture = output();
      const runtime = { execute: async () => ({ code: 0, stdout: '', stderr: '' }) };
      await expect(
        createPlanCliCommand(capture.io, runtime).parseAsync(['node', 'plan', 'annotate', bad]),
      ).rejects.toThrow('Expected a PLAN.md file or its directory');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
