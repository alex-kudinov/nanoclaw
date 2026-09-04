import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Contador cohort release lineage', () => {
  it('requires the resolver that process-payment loads in every immutable release', () => {
    const builder = fs.readFileSync('scripts/build-release.mjs', 'utf8');
    const processor = fs.readFileSync(
      'tools/contador/process-payment.cjs',
      'utf8',
    );

    expect(builder).toContain("'tools/contador/lib/cohort.cjs'");
    expect(builder).toContain('required tracked runtime input missing');
    expect(processor).toContain("require('./lib/cohort.cjs')");
  });
});
