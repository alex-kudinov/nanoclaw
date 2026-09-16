import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath =
  'data/business/migrations/nanoclaw-v2/169_acc_capacity_readiness.sql';
const rollbackPath =
  'data/business/migrations/nanoclaw-v2/rollback_169_acc_capacity_readiness.sql';
const migration = fs.readFileSync(path.resolve(migrationPath), 'utf8');
const rollback = fs.readFileSync(path.resolve(rollbackPath), 'utf8');

describe('ACC capacity readiness data migration', () => {
  it('registers exactly the four missing Module 1 starts and three existing offers', () => {
    for (const date of [
      '2026-10-07',
      '2027-02-01',
      '2027-04-05',
      '2027-07-05',
    ]) {
      expect(migration).toContain(`acc.module-1:${date}`);
    }
    for (const offer of ['acc-module-1', 'acc-full', 'acc-pcc-full']) {
      expect(migration).toContain(`'${offer}'`);
    }
    expect(migration).toContain("SELECT e.pool_key,d.id,12,'open'");
    expect(migration).toContain('migration 169 delivery-block conflict');
    expect(migration).toContain('migration 169 seat-pool conflict');
    expect(migration).toContain('migration 169 offer-mapping conflict');
  });

  it('adds configuration only and no participant, payment, assignment, or commitment', () => {
    expect(migration).toContain(
      'INSERT INTO business_v2.academy_delivery_blocks',
    );
    expect(migration).toContain('INSERT INTO business_v2.academy_seat_pools');
    expect(migration).toContain(
      'INSERT INTO business_v2.academy_seat_pool_offers',
    );
    expect(migration).not.toMatch(
      /INSERT INTO business_v2\.(student_|academy_capacity_reservations|payments)/,
    );
  });

  it('guards rollback after any use and packages both exact files', () => {
    expect(rollback).toContain(
      'rollback 169 refused: capacity commitments exist',
    );
    expect(rollback).toContain(
      'rollback 169 refused: capacity publications exist',
    );
    expect(rollback).toContain('rollback 169 refused: class assignments exist');
    const release = fs.readFileSync(
      path.resolve('scripts/build-release.mjs'),
      'utf8',
    );
    expect(release).toContain(`'${migrationPath}'`);
    expect(release).toContain(`'${rollbackPath}'`);
  });
});
