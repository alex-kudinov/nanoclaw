import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const catalog = JSON.parse(fs.readFileSync('facts/catalogs/student-enrollment-projection-targets-v1.json', 'utf8'));

describe('student enrollment projection target catalog', () => {
  it('pins the one fully settled dated self-purchase pilot', () => {
    expect(catalog.pilot).toEqual({
      offer_key: 'supervision-inaugural', offer_version: 1,
      funding_status: 'settled', payer_relationship: 'self_purchase_explicit',
      delivery_block_key: 'supervision:2026-10-07', source_admission_required: true,
    });
  });
  it('names all targets exactly once and requires roster plus Heartbeat', () => {
    expect(catalog.targets.map((target: any) => target.target).sort()).toEqual(['encharge', 'heartbeat', 'plutio', 'student_roster']);
    expect(catalog.targets.filter((target: any) => target.disposition === 'required').map((target: any) => target.target).sort()).toEqual(['heartbeat', 'student_roster']);
  });
  it('keeps current rollout readiness false and the Heartbeat layers distinct', () => {
    expect(catalog.targets.every((target: any) => !target.permission_ready && !target.activation_ready)).toBe(true);
    const heartbeat = catalog.targets.find((target: any) => target.target === 'heartbeat');
    expect(heartbeat.destination.course_access_group_id).toBe('fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83');
    expect(heartbeat.destination.delivery_marker_group_id).toBeNull();
    expect(heartbeat.readiness_reason).toContain('fail closed');
  });
  it('keeps Encharge and Plutio explicitly not applicable without destinations', () => {
    for (const target of catalog.targets.filter((target: any) => ['encharge', 'plutio'].includes(target.target))) {
      expect(target.disposition).toBe('not_applicable');
      expect(target.destination).toBeNull();
      expect(target.readiness_reason).toContain('not applicable');
    }
  });
});
