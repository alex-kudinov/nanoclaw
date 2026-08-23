import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('program-facts immutable release inputs', () => {
  it('packages tracked facts and the deterministic sync/check command', () => {
    const builder = fs.readFileSync('scripts/build-release.mjs', 'utf8');
    expect(builder).toMatch(/'container',\s*'facts',\s*'groups',/);
    expect(builder).toContain("'tools/sync-program-facts.py'");
  });
});
