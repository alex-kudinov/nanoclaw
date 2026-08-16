import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  assertBookingCapabilityCutoverPlan,
  planBookingCapabilityCutover,
} from './booking-capability-cutover.js';
import type { RegisteredGroup } from './types.js';

function bookingGroup(): RegisteredGroup {
  return {
    name: 'Booking',
    folder: 'booking',
    trigger: '',
    added_at: '2026-04-02T00:00:00Z',
    requiresTrigger: false,
    containerConfig: {
      model: 'sonnet',
      timeout: 600_000,
      additionalMounts: [
        {
          hostPath: 'knowledge/agents/booking',
          containerPath: 'knowledge',
          readonly: true,
        },
        {
          hostPath: '/opaque/plutio',
          containerPath: 'plutio',
          readonly: true,
        },
        {
          hostPath: '/opaque/toolbox',
          containerPath: '/workspace/extra/toolbox-lib',
          readonly: true,
        },
        {
          hostPath: 'agent_docs',
          containerPath: 'agent_docs',
          readonly: true,
        },
      ],
    },
  };
}

describe('Booking capability registration cutover', () => {
  it('removes only Plutio and toolbox-lib while preserving all other config', () => {
    const input = bookingGroup();
    const plan = planBookingCapabilityCutover(input);

    expect(() => assertBookingCapabilityCutoverPlan(plan)).not.toThrow();
    expect(plan.removedMountTargets).toEqual(['plutio', 'toolbox-lib']);
    expect(plan.retainedMountTargets).toEqual(['agent_docs', 'knowledge']);
    expect(plan.updatedGroup.containerConfig).toMatchObject({
      model: 'sonnet',
      timeout: 600_000,
    });
    expect(input.containerConfig?.additionalMounts).toHaveLength(4);
  });

  it('is idempotent once both mounts are absent', () => {
    const first = planBookingCapabilityCutover(bookingGroup());
    const replay = planBookingCapabilityCutover(first.updatedGroup);

    expect(replay.changed).toBe(false);
    expect(() => assertBookingCapabilityCutoverPlan(replay)).not.toThrow();
  });

  it('fails closed on a partial legacy mount state', () => {
    const group = bookingGroup();
    group.containerConfig!.additionalMounts =
      group.containerConfig!.additionalMounts!.filter(
        (mount) => !mount.containerPath?.includes('toolbox-lib'),
      );
    const plan = planBookingCapabilityCutover(group);

    expect(() => assertBookingCapabilityCutoverPlan(plan)).toThrow(
      /partial retired mounts/,
    );
  });
});

describe('Booking tracked capability contract', () => {
  it('keeps direct Plutio tools, credentials, and mounts out of Booking', () => {
    const root = process.cwd();
    const procedure = fs.readFileSync(
      path.join(root, 'groups/booking/EXECUTION-STEPS.md'),
      'utf8',
    );
    const prompt = fs.readFileSync(
      path.join(root, 'groups/booking/CLAUDE.md'),
      'utf8',
    );
    const registration = fs.readFileSync(
      path.join(root, 'scripts/register-booking.ts'),
      'utf8',
    );
    const releaseBuilder = fs.readFileSync(
      path.join(root, 'scripts/build-release.mjs'),
      'utf8',
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, 'capabilities/booking.json'), 'utf8'),
    );

    expect(manifest.credentials.families).toEqual(['business_db']);
    expect(
      manifest.mounts.additional.map(
        (mount: { target: string }) => mount.target,
      ),
    ).toEqual(['knowledge', 'agent_docs']);
    expect(`${procedure}\n${registration}`).not.toMatch(
      /upsert-person\.sh|log-activity\.sh|PLUTIO_API_|containerPath:\s*['"](?:plutio|toolbox-lib)/,
    );
    expect(prompt).toContain('No Plutio credentials or tools are available');
    expect(procedure).toContain('appt:${appointment_id}:canceled');
    expect(procedure).toContain(
      'appt:${appointment_id}:rescheduled:${new_start}',
    );
    expect(releaseBuilder).toContain(
      "'scripts/set-booking-capability-boundary.mjs'",
    );
  });
});
