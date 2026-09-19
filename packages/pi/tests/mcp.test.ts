/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mcp } from '../src/mcp';

describe('mcp.serversEnsure', () => {
  it('merges servers with the adapter schema', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'diffpi-mcp-'));
    const path = mcp.globalConfigPath(homeDir);
    const first = await mcp.serversEnsure({ mise: { command: 'mise', args: ['mcp'] } }, { path });
    const second = await mcp.serversEnsure({ mise: { command: 'mise', args: ['mcp'] } }, { path });
    const config = JSON.parse(await readFile(path, 'utf8'));
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(config.mcpServers.mise).toEqual({ command: 'mise', args: ['mcp'] });
  });
});
