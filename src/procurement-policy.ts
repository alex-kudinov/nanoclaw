/**
 * Fail-closed host policy for Procurement collection and human review.
 *
 * Discovery and queue reads remain available without these switches. Writing
 * CaleProcure observations or applying a Slack decision requires an explicit
 * gate. Review additionally requires a named Slack user and action epoch so a
 * deploy cannot accidentally turn "any human in channel" into authority.
 */

export interface ProcurementReviewPolicy {
  enabled: boolean;
  epoch: string | null;
  operatorUids: ReadonlySet<string>;
  reason: 'enabled' | 'disabled' | 'missing_epoch' | 'missing_operators';
}

export function configuredProcurementOperatorUids(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  return new Set(
    (env.PROCUREMENT_OPERATOR_UIDS ?? '')
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function currentProcurementReviewPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ProcurementReviewPolicy {
  const epoch = env.PROCUREMENT_REVIEW_EPOCH?.trim() || null;
  const operatorUids = configuredProcurementOperatorUids(env);
  if (env.PROCUREMENT_REVIEW_ENABLED !== '1') {
    return { enabled: false, epoch, operatorUids, reason: 'disabled' };
  }
  if (!epoch) {
    return { enabled: false, epoch, operatorUids, reason: 'missing_epoch' };
  }
  if (operatorUids.size === 0) {
    return { enabled: false, epoch, operatorUids, reason: 'missing_operators' };
  }
  return { enabled: true, epoch, operatorUids, reason: 'enabled' };
}

export function isNamedProcurementOperator(
  uid: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !!uid && configuredProcurementOperatorUids(env).has(uid);
}

export function caleProcureIngestEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.PROCUREMENT_CALEPROCURE_INGEST_ENABLED === '1';
}

export function procurementPolicyDiagnostic(
  env: NodeJS.ProcessEnv = process.env,
): {
  collectionEnabled: boolean;
  reviewEnabled: boolean;
  reviewReason: ProcurementReviewPolicy['reason'];
  operatorCount: number;
  epochConfigured: boolean;
} {
  const review = currentProcurementReviewPolicy(env);
  return {
    collectionEnabled: caleProcureIngestEnabled(env),
    reviewEnabled: review.enabled,
    reviewReason: review.reason,
    operatorCount: review.operatorUids.size,
    epochConfigured: review.epoch !== null,
  };
}
