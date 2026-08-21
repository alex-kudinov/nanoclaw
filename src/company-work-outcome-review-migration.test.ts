import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/127_company_work_outcome_review_packets.sql',
    import.meta.url,
  ),
  'utf8',
);
const rollback = fs.readFileSync(
  new URL(
    '../data/business/migrations/nanoclaw-v2/rollback_127_company_work_outcome_review_packets.sql',
    import.meta.url,
  ),
  'utf8',
);
const releaseBuilder = fs.readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

describe('migration 127 Company Work outcome-review packets', () => {
  it('binds one packet to one exact delivery event and assessment receipt', () => {
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_work_outcome_review_packets',
    );
    expect(migration).toContain(
      'CREATE TABLE business_v2.company_work_outcome_review_events',
    );
    expect(migration).toContain('REFERENCES business_v2.company_work_events');
    expect(migration).toContain(
      'REFERENCES business_v2.company_work_outcome_quality_receipts',
    );
    expect(migration).toContain(
      'UNIQUE (work_item_id, delivery_event_version)',
    );
    expect(migration).toContain('UNIQUE (slack_channel_jid, slack_message_ts)');
  });

  it('permits only the closed delivery and decision state machine', () => {
    for (const state of [
      'pending',
      'posted',
      'delivery_uncertain',
      'decided',
    ]) {
      expect(migration).toContain(`'${state}'`);
    }
    expect(migration).toContain(
      "OLD.status = 'pending' AND\n       NEW.status IN ('posted', 'delivery_uncertain')",
    );
    expect(migration).toContain(
      "OLD.status = 'posted' AND NEW.status = 'decided'",
    );
    expect(migration).toContain(
      'posted outcome-review delivery binding is immutable',
    );
    expect(migration).toContain('outcome-review decision binding is immutable');
    expect(migration).toContain(
      'company_work_outcome_review_events_append_only',
    );
  });

  it('stores hashes and bounded receipts but no customer or message content', () => {
    for (const field of [
      'packet_fingerprint',
      'source_key_sha256',
      'evidence_sha256',
      'decision_actor_sha256',
      'assessment_receipt_id',
    ]) {
      expect(migration).toContain(field);
    }
    const ddl = migration.replace(/^--.*$/gm, '').split('COMMENT ON TABLE')[0];
    expect(ddl).not.toMatch(
      /\b(?:customer_email|recipient|subject|message_body|raw_content|prompt|remediation_action|payload|jsonb)\b/i,
    );
    expect(migration).not.toMatch(/GRANT[\s\S]*nanoclaw_(?!admin)/);
  });

  it('refuses rollback after packet or lifecycle history exists', () => {
    expect(rollback).toContain('v_packets <> 0 OR v_events <> 0');
    expect(rollback).toContain('outcome-review history exists');
    expect(rollback).not.toContain('DELETE FROM');
    expect(rollback).not.toContain('TRUNCATE');
  });

  it('binds migration and guarded rollback into immutable releases', () => {
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/127_company_work_outcome_review_packets.sql'",
    );
    expect(releaseBuilder).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_127_company_work_outcome_review_packets.sql'",
    );
  });
});
