import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/128_company_work_outcome_review_plus_one.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_128_company_work_outcome_review_plus_one.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 128 outcome-review +1 reaction', () => {
  it('widens only the closed decision-reaction constraint', () => {
    expect(migration).toContain(
      'company_work_outcome_review_packets_decision_reaction_check',
    );
    expect(migration).toContain("'+1'");
    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(migration).not.toMatch(/\bGRANT\b/i);
  });

  it('refuses rollback after a durable +1 decision', () => {
    expect(rollback).toContain("decision_reaction = '+1'");
    expect(rollback).toContain(
      'outcome-review +1 decision history exists; refusing vocabulary rollback',
    );
    const sql = rollback.replace(/^--.*$/gm, '');
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE)\b/i);
  });

  it('binds migration and guarded rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/128_company_work_outcome_review_plus_one.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_128_company_work_outcome_review_plus_one.sql'",
    );
  });
});
