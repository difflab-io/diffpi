/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mise } from '../../src/extensions/misex';

describe('mise', () => {
  it('exposes global and local operations', () => {
    const operations = [
      'executableCheck',
      'install',
      'hookEnsure',
      'toolCheckGlobal',
      'toolInstallGlobal',
      'toolCheckLocal',
      'toolInstallLocal',
      'toolUpdateAllGlobal',
    ] as const;
    for (const name of operations) expect(typeof mise[name]).toBe('function');
  });

  it('writes supported shell hooks once', async () => {
    const cases = [
      ['/bin/bash', '.bashrc'],
      ['/bin/zsh', '.zshrc'],
      ['/usr/bin/fish', '.config/fish/config.fish'],
      ['/usr/bin/nu', '.config/nushell/config.nu'],
      ['/usr/bin/xonsh', '.xonshrc'],
      ['/usr/bin/elvish', '.config/elvish/rc.elv'],
      ['/usr/bin/pwsh', '.config/powershell/Microsoft.PowerShell_profile.ps1'],
    ] as const;
    for (const [shell, relativePath] of cases) {
      const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-mise-'));
      const first = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell });
      const second = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell });
      const content = await readFile(join(homeDir, relativePath), 'utf8');
      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
      expect(content.match(/@difflab\/pi mise/g)?.length).toBe(2);
    }
  });

  it('falls back to Bash for unknown shells', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-mise-'));
    const result = await mise.hookEnsure('/usr/bin/mise', { homeDir, shell: '/bin/custom-shell' });
    expect(result.path).toBe(join(homeDir, '.bashrc'));
    expect(await readFile(result.path, 'utf8')).toContain('activate bash');
  });

  it('checks the complete minimum tool version', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-version-'));
    const executable = join(homeDir, 'mise');
    await writeFile(executable, '#!/bin/sh\nprintf \'%s\\n\' \'[{"installed":true,"version":"22.19.0"}]\'\n');
    await chmod(executable, 0o755);
    expect(await mise.toolCheckGlobal(executable, 'node', '22.19.0')).toBe(true);
    expect(await mise.toolCheckGlobal(executable, 'node', '22.20.0')).toBe(false);
  });
});
