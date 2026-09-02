import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('program-facts immutable release inputs', () => {
  it('packages tracked facts and the deterministic sync/check command', () => {
    const builder = fs.readFileSync('scripts/build-release.mjs', 'utf8');
    expect(builder).toMatch(/'container',\s*'facts',\s*'groups',/);
    expect(builder).toContain("'tools/sync-program-facts.py'");
    expect(builder).toContain("'tools/validate-knowledge.sh'");
    expect(builder).toContain("'knowledge/agents/procurement'");
    expect(builder).not.toMatch(/^\s*'knowledge',\s*$/m);
    expect(builder).toContain("'check'");
    expect(builder).toContain("'--target-root'");
    const validator = fs.readFileSync('tools/validate-knowledge.sh', 'utf8');
    expect(validator).toContain(
      'PROGRAM_FACT_ROOT="${NANOCLAW_CODE_ROOT:-$PROJECT_ROOT}"',
    );
    expect(validator).toContain('--target-root "$PROJECT_ROOT"');
  });
});
