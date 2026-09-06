import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve(
  'data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql',
);
const rollbackPath = path.resolve(
  'data/business/migrations/nanoclaw-v2/rollback_143_academy_capacity_dark.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const rollback = fs.readFileSync(rollbackPath, 'utf8');

const tables = [
  'academy_delivery_blocks',
  'academy_seat_pools',
  'academy_seat_pool_offers',
  'academy_capacity_reservations',
  'academy_waitlist_entries',
  'academy_waitlist_offers',
  'academy_capacity_events',
];

describe('Academy capacity dark migration', () => {
  it('creates only the accepted capacity extension and inserts no data', () => {
    for (const table of tables)
      expect(migration).toContain(`CREATE TABLE business_v2.${table}`);
    expect(migration).toContain(
      'CREATE VIEW business_v2.v_academy_seat_pool_occupancy',
    );
    expect(migration).not.toMatch(
      /CREATE TABLE business_v2\.student_enrollments_v2/,
    );
    expect(migration).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+business_v2\b/i);
  });

  it('enforces one pool per delivery block and many versioned offer mappings', () => {
    expect(migration).toContain('delivery_block_id bigint NOT NULL UNIQUE');
    expect(migration).toContain(
      'UNIQUE (pool_id, offer_key, catalog_revision)',
    );
    expect(migration).toContain(
      'CREATE INDEX academy_seat_pool_offers_active_idx',
    );
  });

  it('binds assignments to delivery blocks without demanding a blind backfill', () => {
    expect(migration).toContain(
      'ADD CONSTRAINT student_class_assignments_delivery_block_fk',
    );
    expect(migration).toContain(
      'REFERENCES business_v2.academy_delivery_blocks(delivery_block_key)',
    );
    expect(migration).toMatch(/delivery_block_key\)\s+NOT VALID;/);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX student_class_assignments_current_enrollment_block_uniq',
    );
    expect(migration).toContain("WHERE state IN ('pending', 'active')");
  });

  it('bounds checkout, manual, and internal waitlist reservations', () => {
    expect(migration).toContain(
      "channel IN ('checkout', 'manual', 'waitlist_offer')",
    );
    expect(migration).toContain('UNIQUE (channel, idempotency_key)');
    expect(migration).toContain(
      "channel = 'checkout' AND expires_at <= created_at + interval '30 minutes'",
    );
    expect(migration).toContain(
      "channel IN ('manual', 'waitlist_offer') AND expires_at <= created_at + interval '7 days'",
    );
    expect(migration).toContain("channel <> 'manual' OR reason IS NOT NULL");
    expect(migration).toContain(
      'FOREIGN KEY (order_id, seat_id)\n    REFERENCES business_v2.student_enrollment_seats(order_id, id)',
    );
  });

  it('implements FIFO waitlist uniqueness and one active offer per pool', () => {
    expect(migration).toContain('academy_waitlist_entries_fifo_idx');
    expect(migration).toContain('(pool_id, joined_at, sequence_number, id)');
    expect(migration).toContain('academy_waitlist_entries_active_contact_uniq');
    expect(migration).toContain('academy_waitlist_offers_one_active_pool_uniq');
    expect(migration).toContain(
      "WHERE state IN ('staged', 'approved', 'sent', 'accepted')",
    );
    expect(migration).toContain(
      "state <> 'sent' OR delivery_receipt_sha256 IS NOT NULL",
    );
    expect(migration).toContain(
      'FOREIGN KEY (pool_id, entry_id)\n    REFERENCES business_v2.academy_waitlist_entries(pool_id, id)',
    );
    expect(migration).toContain(
      'FOREIGN KEY (pool_id, reservation_id)\n    REFERENCES business_v2.academy_capacity_reservations(pool_id, id)',
    );
  });

  it('derives occupancy from assignments plus only live holds', () => {
    expect(migration).toContain(
      "FROM business_v2.student_class_assignments\n  WHERE state IN ('pending', 'active')",
    );
    expect(migration).toContain("WHERE state = 'held' AND expires_at > now()");
    expect(migration).toContain(
      'sp.capacity - COALESCE(ac.occupied, 0) - COALESCE(rc.reserved, 0)',
    );
    expect(migration).toContain("THEN 'sold_out'");
  });

  it('keeps events append-only and all objects admin-only', () => {
    expect(migration).toContain(
      'CREATE TRIGGER academy_capacity_events_append_only',
    );
    expect(migration).toContain('OWNER TO nanoclaw_admin');
    expect(migration).toContain('REVOKE ALL ON business_v2.%I FROM PUBLIC');
    expect(migration).not.toMatch(
      /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|EXECUTE).*\bTO\s+(?!nanoclaw_admin)/is,
    );
  });

  it('guards rollback and removes only migration-143 objects', () => {
    expect(rollback).toContain(
      'migration 143 rollback refused: Academy capacity evidence exists',
    );
    expect(rollback).toContain(
      'DROP CONSTRAINT student_class_assignments_delivery_block_fk',
    );
    for (const table of tables)
      expect(rollback).toContain(`DROP TABLE business_v2.${table}`);
    expect(rollback).not.toMatch(/DROP\s+(SCHEMA|DATABASE)/i);
    expect(rollback).not.toContain('DROP TABLE business_v2.student_');
  });

  it('packages both files but leaves the engine unwired', () => {
    const release = fs.readFileSync(
      path.resolve('scripts/build-release.mjs'),
      'utf8',
    );
    expect(release).toContain(
      "'data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql'",
    );
    expect(release).toContain(
      "'data/business/migrations/nanoclaw-v2/rollback_143_academy_capacity_dark.sql'",
    );
    const index = fs.readFileSync(path.resolve('src/index.ts'), 'utf8');
    expect(index).not.toContain("from './academy-capacity.js'");
    expect(index).toContain("from './academy-capacity-operator-config.js'");
    expect(index).not.toContain("from './academy-capacity-operator-store.js'");
  });
});
