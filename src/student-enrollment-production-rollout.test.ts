import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { validateStudentEnrollmentProductionRollout } from '../scripts/validate-student-enrollment-production-rollout.mjs';

const packet = JSON.parse(
  fs.readFileSync(
    'docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.json',
    'utf8',
  ),
);
const schema = JSON.parse(
  fs.readFileSync(
    'docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.schema.json',
    'utf8',
  ),
);

function removePath(value: any, dotted: string): any {
  const copy = structuredClone(value);
  const segments = dotted.split('.');
  const leaf = segments.pop()!;
  let cursor = copy;
  for (const segment of segments) cursor = cursor[segment];
  delete cursor[leaf];
  return copy;
}

describe('student enrollment production-admission rollout packet', () => {
  it('validates the exact preparation-only packet and pinned source hashes', () => {
    expect(validateStudentEnrollmentProductionRollout(packet, schema)).toEqual(
      [],
    );
  });

  it('fails closed when any required target, permission, migration, writer, evidence, abort, or rollback path is omitted', () => {
    for (const requiredPath of schema['x-required-paths']) {
      const findings = validateStudentEnrollmentProductionRollout(
        removePath(packet, requiredPath),
        schema,
        { verifyFiles: false },
      );
      expect(findings, requiredPath).toContain(
        `missing required path ${requiredPath}`,
      );
    }
  });

  it('refuses broadened population, readiness claims, migration drift, writer bypass, or reordered milestones', () => {
    const variants = [
      {
        value: {
          ...packet,
          population: { ...packet.population, maximum_natural_events: 2 },
        },
        finding: 'population.maximum_natural_events must equal 1',
      },
      {
        value: {
          ...packet,
          destinations: {
            ...packet.destinations,
            heartbeat: {
              ...packet.destinations.heartbeat,
              activation_ready_now: true,
            },
          },
        },
        finding:
          'Heartbeat must remain not ready until write/readback preflight',
      },
      {
        value: {
          ...packet,
          migrations: packet.migrations.map((migration: any, index: number) =>
            index === 1
              ? { ...migration, source_sha256: '0'.repeat(64) }
              : migration,
          ),
        },
        finding: 'migration 147 hash mismatch',
      },
      {
        value: {
          ...packet,
          writer_ownership: {
            ...packet.writer_ownership,
            actual_ingress_paths:
              packet.writer_ownership.actual_ingress_paths.slice(0, 1),
          },
        },
        finding: 'exactly two actual Stripe ingress paths are required',
      },
      {
        value: {
          ...packet,
          rollout: {
            ...packet.rollout,
            milestones: [...packet.rollout.milestones].reverse(),
          },
        },
        finding: 'canonical then immediate projection milestones are required',
      },
      {
        value: { ...packet, unreviewed_escape_hatch: true },
        finding: 'unexpected top-level field unreviewed_escape_hatch',
      },
    ];
    for (const variant of variants)
      expect(
        validateStudentEnrollmentProductionRollout(variant.value, schema, {
          verifyFiles: false,
        }),
      ).toContain(variant.finding);
  });

  it('detects same-length substitution in every safety-bearing control family', () => {
    const variants = [
      (value: any) => {
        value.eligibility.all_required[0] = 'weaker eligibility';
      },
      (value: any) => {
        value.eligibility.refuse_or_preserve_legacy[0] = 'weaker refusal';
      },
      (value: any) => {
        value.writer_ownership.legacy_writer_rule = 'legacy may bypass';
      },
      (value: any) => {
        value.destinations.student_roster.readback_contract = 'trust request';
      },
      (value: any) => {
        value.migration_runbook.guarded_rollback = 'delete evidence';
      },
      (value: any) => {
        value.rollout.monitoring.checks[0] = 'unrelated check';
      },
      (value: any) => {
        value.rollout.abort_triggers[0] = 'ignore failed preflight';
      },
      (value: any) => {
        value.duplicate_and_alias_assertions[0] = 'allow duplicate';
      },
      (value: any) => {
        value.rollback.post_rollback_verification[0] = 'skip health';
      },
      (value: any) => {
        value.external_mutations[0] = 'unbounded mutation';
      },
      (value: any) => {
        value.owner_decisions[0].safe_hold = 'proceed without authority';
      },
      (value: any) => {
        value.forbidden_actions[0] = 'historical reads allowed';
      },
    ];
    for (const mutate of variants) {
      const value = structuredClone(packet);
      mutate(value);
      const findings = validateStudentEnrollmentProductionRollout(
        value,
        schema,
        { verifyFiles: false },
      );
      expect(findings).toContain(
        'safety contract hash does not match packet contents',
      );
      expect(findings).toContain(
        'safety contract differs from the reviewed validator pin',
      );
    }
  });
});
