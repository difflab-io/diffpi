/// <reference types="bun" />

import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { resolveBundledAgentsDir } from '../src/assets';

describe('resolveBundledAgentsDir', () => {
  it('locates bundled agents from nested build entry points', () => {
    const nestedEntry = new URL('../dist/extensions/index.js', import.meta.url).href;
    const expected = fileURLToPath(new URL('../agents', import.meta.url));
    expect(resolveBundledAgentsDir(nestedEntry)).toBe(expected);
  });
});
