import type { Pool } from 'pg';

import { getBusinessPool } from './business-db.js';
import { DATA_DIR } from './config.js';
import {
  createHeartbeatProjectionApi,
  createStudentRosterApi,
} from './student-enrollment-provider-api.js';
import {
  FileProjectionPreimageStore,
  HeartbeatProjectionDriver,
  StudentRosterProjectionDriver,
} from './student-enrollment-provider-drivers.js';
import { resolveStudentEnrollmentPilotConfig } from './student-enrollment-pilot-config.js';
import {
  assertStudentEnrollmentProductionDatabase,
  createStudentEnrollmentProductionFacade,
  type EnrollmentPilotRouteInput,
  type EnrollmentPilotRouteResult,
} from './student-enrollment-production.js';
import {
  deliverProjection,
  type StudentProjectionTarget,
} from './student-enrollment-projection.js';
import {
  claimExactProjection,
  PgProjectionDeliveryLedger,
  readExactProjectionState,
} from './student-enrollment-projection-store.js';
import { createStripeEnrollmentEvidenceResolver } from './student-enrollment-stripe-evidence.js';
import type { ReleaseIdentity } from './release-integrity.js';

export interface EnrollmentPilotDeliveryResult {
  studentRoster: 'verified' | 'retryable_failure' | 'held' | 'not_run';
  heartbeat: 'verified' | 'retryable_failure' | 'held' | 'not_run';
  complete: boolean;
}

export interface StudentEnrollmentPilotRuntime {
  route(input: EnrollmentPilotRouteInput): Promise<EnrollmentPilotRouteResult>;
  deliver(
    route: Extract<EnrollmentPilotRouteResult, { writer: 'enrollment' }>,
  ): Promise<EnrollmentPilotDeliveryResult>;
  status(): Record<string, unknown>;
}

export function createStudentEnrollmentPilotRuntime(input: {
  release: ReleaseIdentity;
  pool?: Pool;
}): StudentEnrollmentPilotRuntime {
  const pool = input.pool ?? getBusinessPool();
  const config = resolveStudentEnrollmentPilotConfig(input.release);
  const facade = createStudentEnrollmentProductionFacade({
    pool,
    config,
    resolveEvidence: createStripeEnrollmentEvidenceResolver(pool),
  });
  let lastClaimedAt: string | null = null;
  let lastDelivery: EnrollmentPilotDeliveryResult | null = null;
  let preimages: FileProjectionPreimageStore | null = null;
  const guard = (
    client: Parameters<typeof assertStudentEnrollmentProductionDatabase>[0],
  ) => assertStudentEnrollmentProductionDatabase(client, config);

  return {
    async route(routeInput) {
      const result = await facade.route(routeInput);
      if (result.writer !== 'legacy') lastClaimedAt = new Date().toISOString();
      return result;
    },
    async deliver(route) {
      if (route.admission.disposition !== 'accepted') {
        lastDelivery = {
          studentRoster: 'not_run',
          heartbeat: 'not_run',
          complete: false,
        };
        return lastDelivery;
      }
      preimages ??= new FileProjectionPreimageStore(
        `${DATA_DIR}/student-enrollment-projection-preimages`,
      );
      const drivers = {
        student_roster: new StudentRosterProjectionDriver(
          createStudentRosterApi(),
          preimages,
        ),
        heartbeat: new HeartbeatProjectionDriver(
          createHeartbeatProjectionApi(),
          preimages,
        ),
      };
      const result: EnrollmentPilotDeliveryResult = {
        studentRoster: 'not_run',
        heartbeat: 'not_run',
        complete: false,
      };
      for (const target of [
        'student_roster',
        'heartbeat',
      ] as const satisfies readonly StudentProjectionTarget[]) {
        const now = new Date();
        const claimed = await claimExactProjection(
          pool,
          target,
          route.projections.assignmentKey,
          now.toISOString(),
          new Date(now.getTime() + 120_000).toISOString(),
          guard,
        );
        if (!claimed) {
          const state = await readExactProjectionState(
            pool,
            target,
            route.projections.assignmentKey,
            guard,
          );
          const settled = state === 'verified' ? 'verified' : 'held';
          if (target === 'student_roster') result.studentRoster = settled;
          else result.heartbeat = settled;
          continue;
        }
        const delivered = await deliverProjection(
          claimed.envelope,
          drivers[target],
          new PgProjectionDeliveryLedger(
            pool,
            claimed.leaseToken,
            'enrollment-pilot:projection',
            guard,
          ),
        );
        if (target === 'student_roster') result.studentRoster = delivered;
        else result.heartbeat = delivered;
        if (delivered !== 'verified') break;
      }
      result.complete =
        result.studentRoster === 'verified' && result.heartbeat === 'verified';
      lastDelivery = result;
      return result;
    },
    status() {
      return {
        ...facade.status(),
        oneEventBudget: 'database_enforced',
        lastClaimedAt,
        lastDelivery,
      };
    },
  };
}
