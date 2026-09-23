/// <reference types="bun" />
import { describe, expect, it } from 'bun:test';
import { watchCiTool } from '../../src/tools/ci';

describe('watch_ci', () => {
  it('rejects abbreviated commit SHAs before monitoring', async () => {
    await expect(
      watchCiTool.execute(
        'watch',
        { sha: 'abcdef0', timeoutSeconds: 30, pollSeconds: 2 },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow();
  });
});
