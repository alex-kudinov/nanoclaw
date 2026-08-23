/**
 * Default-off host adapter from the minimized healer catalog to Company Work.
 *
 * Importing this module does nothing. The only public runner refuses writes
 * unless COMPANY_HEALER_WORK_ENABLED is exactly `1`, and no daemon, scheduler,
 * Slack, remediation, or implementation path imports it.
 */

import { createHash } from 'node:crypto';

import { withAgentContext } from '../business-db.js';
import { readEnvFile } from '../env.js';
import type {
  CompanyWorkItem,
  CompanyWorkLedgerClient,
  CompanyWorkReceiptInput,
} from '../company-work-ledger.js';
import {
  buildHealerCompanyWorkPlan,
  type HealerCompanyWorkOperation,
  type HealerCompanyWorkPlan,
  type HealerCompanyWorkPlanItem,
} from './company-work-projection.js';
import {
  ensureHealerWorkItemWithClient,
  readExistingHealerWorkItemsWithClient,
  recordHealerObservationWithClient,
  transitionHealerWorkItemWithClient,
} from './company-work-ledger.js';
import type { HealerResolutionCatalog } from './resolution-catalog.js';

export const COMPANY_HEALER_WORK_ENABLED_KEY =
  'COMPANY_HEALER_WORK_ENABLED' as const;

export interface HealerCompanyWorkAdapterConfig {
  enabled: boolean;
}

export interface HealerCompanyWorkApplyItemResult {
  sourceKey: string;
  operation: HealerCompanyWorkOperation;
  workItemId: string | null;
  transitionApplied: boolean;
  observationApplied: boolean;
}

export interface HealerCompanyWorkApplyResult {
  status: 'applied';
  plan: HealerCompanyWorkPlan;
  items: HealerCompanyWorkApplyItemResult[];
}

export interface HealerCompanyWorkDisabledResult {
  status: 'disabled';
  plan: HealerCompanyWorkPlan;
  items: [];
}

export type HealerCompanyWorkAdapterResult =
  | HealerCompanyWorkApplyResult
  | HealerCompanyWorkDisabledResult;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function resolveHealerCompanyWorkAdapterConfig(
  values?: Record<string, string | undefined>,
): HealerCompanyWorkAdapterConfig {
  const resolved =
    values ??
    (() => {
      const fileValues = readEnvFile([COMPANY_HEALER_WORK_ENABLED_KEY]);
      return {
        [COMPANY_HEALER_WORK_ENABLED_KEY]:
          process.env[COMPANY_HEALER_WORK_ENABLED_KEY] ||
          fileValues[COMPANY_HEALER_WORK_ENABLED_KEY],
      };
    })();
  return {
    enabled: resolved[COMPANY_HEALER_WORK_ENABLED_KEY] === '1',
  };
}

function receiptFor(plan: HealerCompanyWorkPlanItem): CompanyWorkReceiptInput {
  const namedNoAction = plan.operation === 'close_decided_no_action';
  if (namedNoAction && !plan.decisionActorSha256) {
    throw new Error(
      'healer-company-work: named no-action closure lacks decision actor',
    );
  }
  const system = namedNoAction
    ? 'healer_named_decision'
    : 'healer_verified_recovery';
  const receiptDigest = digest([
    'healer-resolution-receipt-v1',
    plan.sourceKey,
    plan.operation,
    plan.resolutionFingerprint,
    plan.decisionActorSha256,
    plan.observedAt,
  ]);
  return {
    type: 'outcome_validation',
    system,
    key: `healer-receipt:${receiptDigest}`,
    evidenceSha256: plan.resolutionFingerprint,
    externalActionId: namedNoAction
      ? `healer-decision:${plan.decisionActorSha256}`
      : `healer-verification:${plan.resolutionFingerprint}`,
    occurredAt: plan.observedAt,
  };
}

async function applyOne(
  client: CompanyWorkLedgerClient,
  plan: HealerCompanyWorkPlanItem,
  existing: CompanyWorkItem | null,
): Promise<{
  item: CompanyWorkItem | null;
  transitionApplied: boolean;
  observationApplied: boolean;
}> {
  let item = existing;
  let transitionApplied = false;

  if (plan.operation === 'ensure_blocked') {
    const ensured = await ensureHealerWorkItemWithClient(client, plan);
    item = ensured.item;
    transitionApplied ||= ensured.applied;
    const blocked = await transitionHealerWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'blocked',
      plan,
    });
    item = blocked.item;
    transitionApplied ||= blocked.applied;
  } else if (plan.operation === 'update_blocked') {
    if (!item) throw new Error('healer-company-work: update lost work item');
    const blocked = await transitionHealerWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'blocked',
      plan,
    });
    item = blocked.item;
    transitionApplied = blocked.applied;
  } else if (plan.operation === 'reopen_blocked') {
    if (!item) throw new Error('healer-company-work: reopen lost work item');
    const reopened = await transitionHealerWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'reopened',
      plan,
    });
    item = reopened.item;
    transitionApplied ||= reopened.applied;
    const blocked = await transitionHealerWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'blocked',
      plan,
    });
    item = blocked.item;
    transitionApplied ||= blocked.applied;
  } else if (
    plan.operation === 'close_verified' ||
    plan.operation === 'close_decided_no_action'
  ) {
    if (!item) throw new Error('healer-company-work: closure lost work item');
    const closed = await transitionHealerWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'outcome_validated',
      plan,
      receipt: receiptFor(plan),
    });
    item = closed.item;
    transitionApplied = closed.applied;
  }

  const observationApplied = item
    ? await recordHealerObservationWithClient(client, item, plan)
    : false;
  return { item, transitionApplied, observationApplied };
}

export async function applyHealerCompanyWorkCatalogWithClient(
  client: CompanyWorkLedgerClient,
  catalog: HealerResolutionCatalog,
): Promise<HealerCompanyWorkApplyResult> {
  const existing = await readExistingHealerWorkItemsWithClient(client);
  const plan = buildHealerCompanyWorkPlan(
    catalog,
    existing.map(({ item: _item, ...projection }) => projection),
  );
  const bySource = new Map(existing.map(({ item }) => [item.sourceKey, item]));
  const items: HealerCompanyWorkApplyItemResult[] = [];
  for (const planned of plan.items) {
    const applied = await applyOne(
      client,
      planned,
      bySource.get(planned.sourceKey) ?? null,
    );
    if (applied.item) bySource.set(planned.sourceKey, applied.item);
    items.push({
      sourceKey: planned.sourceKey,
      operation: planned.operation,
      workItemId: applied.item?.id ?? null,
      transitionApplied: applied.transitionApplied,
      observationApplied: applied.observationApplied,
    });
  }
  return { status: 'applied', plan, items };
}

export async function runHealerCompanyWorkAdapter(
  catalog: HealerResolutionCatalog,
  config = resolveHealerCompanyWorkAdapterConfig(),
): Promise<HealerCompanyWorkAdapterResult> {
  if (!config.enabled) {
    return {
      status: 'disabled',
      plan: buildHealerCompanyWorkPlan(catalog),
      items: [],
    };
  }
  return withAgentContext('healer-resolution-work:host', (client) =>
    applyHealerCompanyWorkCatalogWithClient(client, catalog),
  );
}
