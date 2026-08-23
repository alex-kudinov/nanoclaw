/**
 * Default-off host adapter from the minimized healer catalog to Company Work.
 *
 * Importing this module does nothing. The only public runner refuses writes
 * unless COMPANY_HEALER_WORK_ENABLED is exactly `1`, one exact source key is
 * configured, and the maximum item count is exactly one.
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
import {
  readHealerResolutionCatalog,
  type HealerResolutionCatalog,
} from './resolution-catalog.js';

export const COMPANY_HEALER_WORK_ENABLED_KEY =
  'COMPANY_HEALER_WORK_ENABLED' as const;
export const COMPANY_HEALER_WORK_SOURCE_KEYS_KEY =
  'COMPANY_HEALER_WORK_SOURCE_KEYS' as const;
export const COMPANY_HEALER_WORK_MAX_ITEMS_KEY =
  'COMPANY_HEALER_WORK_MAX_ITEMS' as const;
export const COMPANY_HEALER_WORK_ENV_KEYS = [
  COMPANY_HEALER_WORK_ENABLED_KEY,
  COMPANY_HEALER_WORK_SOURCE_KEYS_KEY,
  COMPANY_HEALER_WORK_MAX_ITEMS_KEY,
] as const;

export interface HealerCompanyWorkAdapterConfig {
  enabled: boolean;
  active: boolean;
  valid: boolean;
  sourceKeys: string[];
  maxItems: number;
  configurationError: string | null;
}

export interface HealerCompanyWorkCycleStatus {
  mode: 'disabled' | 'active' | 'failed';
  sourceCount: number;
  attempted: number;
  transitioned: number;
  observations: number;
  duplicates: number;
  errorCode: string | null;
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
      const fileValues = readEnvFile([...COMPANY_HEALER_WORK_ENV_KEYS]);
      return Object.fromEntries(
        COMPANY_HEALER_WORK_ENV_KEYS.map((key) => [
          key,
          process.env[key] || fileValues[key],
        ]),
      );
    })();
  const enabled = resolved[COMPANY_HEALER_WORK_ENABLED_KEY] === '1';
  const sourceKeys = (resolved[COMPANY_HEALER_WORK_SOURCE_KEYS_KEY] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const maxRaw = resolved[COMPANY_HEALER_WORK_MAX_ITEMS_KEY] ?? '1';
  const maxItems = /^[1-9][0-9]*$/.test(maxRaw) ? Number(maxRaw) : 0;
  let configurationError: string | null = null;
  if (enabled && sourceKeys.length !== 1) {
    configurationError = 'exactly_one_source_required';
  } else if (enabled && new Set(sourceKeys).size !== sourceKeys.length) {
    configurationError = 'duplicate_source';
  } else if (
    enabled &&
    !sourceKeys.every((key) => /^healer:[a-z0-9][a-z0-9-]{7,63}$/.test(key))
  ) {
    configurationError = 'invalid_source';
  } else if (enabled && maxItems !== 1) {
    configurationError = 'max_items_must_equal_one';
  }
  return {
    enabled,
    active: enabled && configurationError === null,
    valid: !enabled || configurationError === null,
    sourceKeys: enabled ? sourceKeys : [],
    maxItems,
    configurationError,
  };
}

export function selectHealerResolutionCatalog(
  catalog: HealerResolutionCatalog,
  config: HealerCompanyWorkAdapterConfig,
): HealerResolutionCatalog {
  if (!config.active || !config.valid) {
    throw new Error('healer-company-work: configuration_invalid');
  }
  const byKey = new Map(catalog.items.map((item) => [item.key, item]));
  const selected = config.sourceKeys.map((key) => byKey.get(key));
  if (selected.some((item) => !item)) {
    throw new Error('healer-company-work: configured_source_missing');
  }
  const items = selected.filter(
    (item): item is HealerResolutionCatalog['items'][number] => Boolean(item),
  );
  if (items.length !== 1 || items.length > config.maxItems) {
    throw new Error('healer-company-work: selection_limit_exceeded');
  }
  return {
    ...catalog,
    scannedRows: items.length,
    currentIncidents: items.length,
    deduplicatedRows: 0,
    summary: {
      pendingDecision: items.filter(
        ({ disposition }) => disposition === 'pending_decision',
      ).length,
      monitoring: items.filter(
        ({ disposition }) => disposition === 'monitoring',
      ).length,
      verifiedFixed: items.filter(
        ({ disposition }) => disposition === 'verified_fixed',
      ).length,
      decidedNoAction: items.filter(
        ({ disposition }) => disposition === 'decided_no_action',
      ).length,
    },
    items,
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
  const selected = selectHealerResolutionCatalog(catalog, config);
  return withAgentContext('healer-resolution-work:host', (client) =>
    applyHealerCompanyWorkCatalogWithClient(client, selected),
  );
}

export async function runHealerCompanyWorkCycle(
  options: {
    config?: HealerCompanyWorkAdapterConfig;
    readCatalog?: typeof readHealerResolutionCatalog;
    runAdapter?: typeof runHealerCompanyWorkAdapter;
  } = {},
): Promise<HealerCompanyWorkCycleStatus> {
  const config = options.config ?? resolveHealerCompanyWorkAdapterConfig();
  if (!config.enabled) {
    return {
      mode: 'disabled',
      sourceCount: 0,
      attempted: 0,
      transitioned: 0,
      observations: 0,
      duplicates: 0,
      errorCode: null,
    };
  }
  if (!config.active || !config.valid) {
    return {
      mode: 'failed',
      sourceCount: config.sourceKeys.length,
      attempted: 0,
      transitioned: 0,
      observations: 0,
      duplicates: 0,
      errorCode: config.configurationError ?? 'configuration_invalid',
    };
  }
  try {
    const catalog = await (
      options.readCatalog ?? readHealerResolutionCatalog
    )();
    const result = await (options.runAdapter ?? runHealerCompanyWorkAdapter)(
      catalog,
      config,
    );
    if (result.status !== 'applied') {
      throw new Error('adapter_disabled_after_active_config');
    }
    const transitioned = result.items.filter(
      ({ transitionApplied }) => transitionApplied,
    ).length;
    const observations = result.items.filter(
      ({ observationApplied }) => observationApplied,
    ).length;
    return {
      mode: 'active',
      sourceCount: config.sourceKeys.length,
      attempted: result.items.length,
      transitioned,
      observations,
      duplicates: result.items.length - Math.max(transitioned, observations),
      errorCode: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = message.includes('configured_source_missing')
      ? 'configured_source_missing'
      : message.includes('selection_limit_exceeded')
        ? 'selection_limit_exceeded'
        : 'projection_failed';
    return {
      mode: 'failed',
      sourceCount: config.sourceKeys.length,
      attempted: 0,
      transitioned: 0,
      observations: 0,
      duplicates: 0,
      errorCode: code,
    };
  }
}
