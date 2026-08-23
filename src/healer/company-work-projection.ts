/**
 * Pure, default-dry-run projection from healer resolutions to Company Work.
 *
 * No current Company Work schema accepts healer-resolution semantics. This
 * module therefore plans exact future mutations without importing a ledger
 * writer. It must remain safe to run before the required schema exists.
 */

import type {
  HealerResolutionCatalog,
  HealerResolutionCatalogItem,
  HealerResolutionDisposition,
} from './resolution-catalog.js';

export const HEALER_COMPANY_WORK_CONTRACT_VERSION = 1 as const;
export const HEALER_COMPANY_WORK_SCHEMA = {
  workflowType: 'healer_resolution',
  completionDefinition: 'healer_resolution_receipt',
  observationTable: 'business_v2.company_healer_resolution_observations',
} as const;

export type ExistingHealerWorkDisposition =
  | 'open'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export interface ExistingHealerWorkItem {
  sourceKey: string;
  disposition: ExistingHealerWorkDisposition;
  version: number;
  resolutionFingerprint: string;
  blockCode: string | null;
}

export type HealerCompanyWorkOperation =
  | 'ensure_blocked'
  | 'update_blocked'
  | 'reopen_blocked'
  | 'close_verified'
  | 'close_decided_no_action'
  | 'hold_for_verification'
  | 'no_op';

export interface HealerCompanyWorkPlanItem {
  contractVersion: typeof HEALER_COMPANY_WORK_CONTRACT_VERSION;
  sourceSystem: 'healer_resolution_catalog';
  sourceKey: string;
  workflowType: typeof HEALER_COMPANY_WORK_SCHEMA.workflowType;
  completionDefinition: typeof HEALER_COMPANY_WORK_SCHEMA.completionDefinition;
  operation: HealerCompanyWorkOperation;
  expectedVersion: number | null;
  resolutionFingerprint: string;
  evidenceSha256: string;
  resolutionDisposition: HealerResolutionDisposition;
  blockCode: string | null;
  decisionCode: string | null;
  decisionOwner: 'unassigned' | null;
  decisionActorSha256: string | null;
  closureCondition: string;
  observedAt: string;
}

export interface HealerCompanyWorkPlan {
  contractVersion: typeof HEALER_COMPANY_WORK_CONTRACT_VERSION;
  generatedAt: string;
  dryRun: true;
  applyAvailable: false;
  requiredSchema: typeof HEALER_COMPANY_WORK_SCHEMA;
  catalogItems: number;
  existingItems: number;
  summary: Record<HealerCompanyWorkOperation, number>;
  items: HealerCompanyWorkPlanItem[];
}

const OPERATION_ORDER: HealerCompanyWorkOperation[] = [
  'ensure_blocked',
  'reopen_blocked',
  'update_blocked',
  'close_verified',
  'close_decided_no_action',
  'hold_for_verification',
  'no_op',
];

function blockCode(item: HealerResolutionCatalogItem): string | null {
  return item.decisionCode
    ? `healer:${item.decisionCode.replaceAll('_', '-')}`
    : null;
}

function operationFor(
  item: HealerResolutionCatalogItem,
  existing: ExistingHealerWorkItem | undefined,
): HealerCompanyWorkOperation {
  if (item.disposition === 'pending_decision') {
    if (!existing) return 'ensure_blocked';
    if (
      existing.disposition === 'completed' ||
      existing.disposition === 'cancelled'
    ) {
      return 'reopen_blocked';
    }
    if (
      existing.disposition === 'blocked' &&
      existing.resolutionFingerprint === item.resolutionFingerprint &&
      existing.blockCode === blockCode(item)
    ) {
      return 'no_op';
    }
    return 'update_blocked';
  }
  if (item.disposition === 'verified_fixed') {
    return existing &&
      existing.disposition !== 'completed' &&
      existing.disposition !== 'cancelled'
      ? 'close_verified'
      : 'no_op';
  }
  if (item.disposition === 'decided_no_action') {
    return existing &&
      existing.disposition !== 'completed' &&
      existing.disposition !== 'cancelled'
      ? 'close_decided_no_action'
      : 'no_op';
  }
  return existing && existing.disposition === 'blocked'
    ? 'hold_for_verification'
    : 'no_op';
}

function planItem(
  item: HealerResolutionCatalogItem,
  existing: ExistingHealerWorkItem | undefined,
): HealerCompanyWorkPlanItem {
  return {
    contractVersion: HEALER_COMPANY_WORK_CONTRACT_VERSION,
    sourceSystem: 'healer_resolution_catalog',
    sourceKey: item.key,
    workflowType: HEALER_COMPANY_WORK_SCHEMA.workflowType,
    completionDefinition: HEALER_COMPANY_WORK_SCHEMA.completionDefinition,
    operation: operationFor(item, existing),
    expectedVersion: existing?.version ?? null,
    resolutionFingerprint: item.resolutionFingerprint,
    evidenceSha256: item.evidenceSha256,
    resolutionDisposition: item.disposition,
    blockCode: item.decisionRequired ? blockCode(item) : null,
    decisionCode: item.decisionCode,
    decisionOwner: item.decisionOwner,
    decisionActorSha256: item.decisionActorSha256,
    closureCondition: item.closureCondition,
    observedAt: item.updatedAt,
  };
}

function emptySummary(): Record<HealerCompanyWorkOperation, number> {
  return Object.fromEntries(OPERATION_ORDER.map((key) => [key, 0])) as Record<
    HealerCompanyWorkOperation,
    number
  >;
}

export function buildHealerCompanyWorkPlan(
  catalog: HealerResolutionCatalog,
  existingItems: ExistingHealerWorkItem[] = [],
): HealerCompanyWorkPlan {
  const existingByKey = new Map<string, ExistingHealerWorkItem>();
  for (const item of existingItems) {
    if (existingByKey.has(item.sourceKey)) {
      throw new Error(
        `duplicate existing healer work source: ${item.sourceKey}`,
      );
    }
    existingByKey.set(item.sourceKey, item);
  }
  const items = catalog.items.map((item) =>
    planItem(item, existingByKey.get(item.key)),
  );
  const summary = emptySummary();
  for (const item of items) summary[item.operation] += 1;
  return {
    contractVersion: HEALER_COMPANY_WORK_CONTRACT_VERSION,
    generatedAt: catalog.generatedAt,
    dryRun: true,
    applyAvailable: false,
    requiredSchema: HEALER_COMPANY_WORK_SCHEMA,
    catalogItems: catalog.items.length,
    existingItems: existingItems.length,
    summary,
    items,
  };
}

export function formatHealerCompanyWorkPlan(
  plan: HealerCompanyWorkPlan,
  json = false,
): string {
  if (json) return `${JSON.stringify(plan, null, 2)}\n`;
  const lines = [
    `Healer Company Work plan — ${plan.generatedAt}`,
    `DRY-RUN ONLY apply_available=${plan.applyAvailable} required_workflow=${plan.requiredSchema.workflowType} catalog=${plan.catalogItems} existing=${plan.existingItems}`,
    OPERATION_ORDER.map((key) => `${key}=${plan.summary[key]}`).join(' '),
  ];
  for (const item of plan.items.filter(
    ({ operation }) => operation !== 'no_op',
  )) {
    lines.push(
      `[${item.operation}] source=${item.sourceKey} resolution=${item.resolutionFingerprint.slice(0, 16)} evidence=${item.evidenceSha256.slice(0, 16)} decision=${item.decisionCode ?? '-'} owner=${item.decisionOwner ?? '-'} block=${item.blockCode ?? '-'}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
