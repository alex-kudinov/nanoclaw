import type { AdditionalMount, RegisteredGroup } from './types.js';
import path from 'node:path';

export const RETIRED_BOOKING_MOUNT_TARGETS = ['plutio', 'toolbox-lib'] as const;

export interface BookingCapabilityCutoverPlan {
  changed: boolean;
  removedMountTargets: string[];
  retainedMountTargets: string[];
  updatedGroup: RegisteredGroup;
}

function normalizedTarget(mount: AdditionalMount): string {
  const parts = (mount.containerPath || path.basename(mount.hostPath))
    .split('/')
    .filter(Boolean);
  return parts.at(-1) || '';
}

/** Pure registration transform; all non-retired configuration is preserved. */
export function planBookingCapabilityCutover(
  group: RegisteredGroup,
): BookingCapabilityCutoverPlan {
  if (group.folder !== 'booking') {
    throw new Error('Booking capability cutover requires the booking group');
  }
  const mounts = group.containerConfig?.additionalMounts ?? [];
  const retired = new Set<string>(RETIRED_BOOKING_MOUNT_TARGETS);
  const removed = mounts.filter((mount) =>
    retired.has(normalizedTarget(mount)),
  );
  const retained = mounts.filter(
    (mount) => !retired.has(normalizedTarget(mount)),
  );
  const updatedGroup: RegisteredGroup = {
    ...group,
    containerConfig: {
      ...group.containerConfig,
      additionalMounts: retained,
    },
  };
  return {
    changed: removed.length > 0,
    removedMountTargets: removed.map(normalizedTarget).sort(),
    retainedMountTargets: retained.map(normalizedTarget).sort(),
    updatedGroup,
  };
}

/** Reject a partial legacy state; zero removals is an idempotent replay. */
export function assertBookingCapabilityCutoverPlan(
  plan: BookingCapabilityCutoverPlan,
): void {
  if (!plan.changed) return;
  const expected = [...RETIRED_BOOKING_MOUNT_TARGETS].sort();
  if (JSON.stringify(plan.removedMountTargets) !== JSON.stringify(expected)) {
    throw new Error(
      `Booking capability cutover found partial retired mounts: ${plan.removedMountTargets.join(',')}`,
    );
  }
}
