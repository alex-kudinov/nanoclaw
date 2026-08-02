import { describe, expect, it } from 'vitest';

import {
  caleProcureIngestEnabled,
  configuredProcurementOperatorUids,
  currentProcurementReviewPolicy,
  isNamedProcurementOperator,
} from './procurement-policy.js';

describe('Procurement host policy', () => {
  it('keeps collection and review disabled by default', () => {
    expect(caleProcureIngestEnabled({})).toBe(false);
    expect(currentProcurementReviewPolicy({})).toEqual({
      enabled: false,
      epoch: null,
      operatorUids: new Set(),
      reason: 'disabled',
    });
  });

  it('requires both an action epoch and named Slack operators', () => {
    expect(
      currentProcurementReviewPolicy({
        PROCUREMENT_REVIEW_ENABLED: '1',
      }).reason,
    ).toBe('missing_epoch');
    expect(
      currentProcurementReviewPolicy({
        PROCUREMENT_REVIEW_ENABLED: '1',
        PROCUREMENT_REVIEW_EPOCH: 'epoch-1',
      }).reason,
    ).toBe('missing_operators');
  });

  it('parses exact operator IDs without a broad non-bot fallback', () => {
    const env = {
      PROCUREMENT_REVIEW_ENABLED: '1',
      PROCUREMENT_REVIEW_EPOCH: 'epoch-1',
      PROCUREMENT_OPERATOR_UIDS: 'U_ALEX, U_BACKUP',
    };
    expect(configuredProcurementOperatorUids(env)).toEqual(
      new Set(['U_ALEX', 'U_BACKUP']),
    );
    expect(currentProcurementReviewPolicy(env).enabled).toBe(true);
    expect(isNamedProcurementOperator('U_ALEX', env)).toBe(true);
    expect(isNamedProcurementOperator('U_OTHER', env)).toBe(false);
  });

  it('requires an exact collection enable value', () => {
    expect(
      caleProcureIngestEnabled({
        PROCUREMENT_CALEPROCURE_INGEST_ENABLED: 'true',
      }),
    ).toBe(false);
    expect(
      caleProcureIngestEnabled({
        PROCUREMENT_CALEPROCURE_INGEST_ENABLED: '1',
      }),
    ).toBe(true);
  });
});
