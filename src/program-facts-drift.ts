/**
 * program-facts-drift — deterministic guard against sales-KB fact drift.
 *
 * Compares the curated facts/programs.yaml against two authoritative sources:
 *   1. tandemweb products.json  — Stripe-authoritative prices + active flags
 *   2. the sales KNOWLEDGE.md    — required facts present, stale values absent
 *
 * Notify-only: it never rewrites either side. A human reconciles on alert,
 * per the marketing→minion one-way-reconciler rule (either side can be stale).
 *
 * Zero-LLM. Motivated by the 2026-07-05 drift where the KB carried a stale
 * $1,997 / 41-hour MCS Practicum while products.json + the live page said
 * $2,997 / 71-hour and nobody caught it until a near customer-facing error.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { parse as parseYaml } from 'yaml';

export type DriftKind =
  | 'price_mismatch'
  | 'product_missing'
  | 'product_inactive'
  | 'kb_missing_fact'
  | 'kb_stale_value'
  | 'catalog_missing'
  | 'catalog_invalid'
  | 'kb_catalog_missing';

export interface DriftFinding {
  program: string;
  kind: DriftKind;
  detail: string;
}

export interface DriftResult {
  checked: number;
  findings: DriftFinding[];
}

export interface ProgramSpec {
  name: string;
  source_url?: string;
  price_usd?: number;
  products_ids?: string[];
  kb_present?: string[];
  kb_absent?: string[];
}

interface FactsFile {
  programs: Record<string, ProgramSpec>;
}

interface ProductEntry {
  price_cents?: number;
  active?: boolean;
}

interface CatalogSnapshot {
  catalog_id?: string;
  catalog_revision?: number;
  catalog_sha256?: string;
  pathway_totals?: {
    approved_programs?: number;
    total_hours?: number;
    core_competency?: number;
    resource_development?: number;
  };
}

export function resolveFactsPath(): string {
  return (
    process.env.PROGRAM_FACTS_PATH ??
    path.join(process.cwd(), 'facts', 'programs.yaml')
  );
}

export function resolveKbPath(): string {
  return (
    process.env.SALES_KB_PATH ??
    path.join(process.cwd(), 'knowledge', 'agents', 'sales', 'KNOWLEDGE.md')
  );
}

export function resolveProductsPath(): string {
  return (
    process.env.PRODUCTS_JSON_PATH ??
    path.join(
      os.homedir(),
      'dev',
      'tandemweb',
      'data',
      'checkout',
      'products.json',
    )
  );
}

export function resolvePractitionerCatalogPath(): string {
  return (
    process.env.PRACTITIONER_FACTS_PATH ??
    path.join(
      process.cwd(),
      'facts',
      'catalogs',
      'practitioner-series.web.json',
    )
  );
}

export function resolvePractitionerPackPath(): string {
  return (
    process.env.PRACTITIONER_FACTS_PACK_PATH ??
    path.join(
      process.cwd(),
      'facts',
      'catalogs',
      'practitioner-series.minion.md',
    )
  );
}

function fmt(cents?: number): string {
  if (cents == null) return 'n/a';
  return `$${(cents / 100).toLocaleString('en-US')}`;
}

/** Price/active check: every products_id must exist, be active, and match price_usd. */
function checkPrice(
  program: string,
  spec: ProgramSpec,
  products: Record<string, ProductEntry>,
): DriftFinding[] {
  const out: DriftFinding[] = [];
  if (spec.price_usd == null || !spec.products_ids?.length) return out;
  const expectCents = Math.round(spec.price_usd * 100);
  for (const id of spec.products_ids) {
    const entry = products[id];
    if (!entry) {
      out.push({
        program,
        kind: 'product_missing',
        detail: `products.json has no entry "${id}"`,
      });
      continue;
    }
    if (entry.active === false) {
      out.push({
        program,
        kind: 'product_inactive',
        detail: `products.json "${id}" is inactive (active:false)`,
      });
    }
    if (entry.price_cents !== expectCents) {
      out.push({
        program,
        kind: 'price_mismatch',
        detail: `products.json "${id}" = ${fmt(entry.price_cents)}, facts.yaml says ${fmt(expectCents)}`,
      });
    }
  }
  return out;
}

/** KB check: required strings present, stale strings absent. */
function checkKb(
  program: string,
  spec: ProgramSpec,
  kb: string,
): DriftFinding[] {
  const out: DriftFinding[] = [];
  for (const s of spec.kb_present ?? []) {
    if (!kb.includes(s)) {
      out.push({
        program,
        kind: 'kb_missing_fact',
        detail: `sales KB missing expected "${s}"`,
      });
    }
  }
  for (const s of spec.kb_absent ?? []) {
    if (kb.includes(s)) {
      out.push({
        program,
        kind: 'kb_stale_value',
        detail: `sales KB still contains stale "${s}"`,
      });
    }
  }
  return out;
}

/** Pure drift comparison. Price checks are skipped when products is empty. */
export function detectDrift(
  facts: FactsFile,
  kb: string,
  products: Record<string, ProductEntry>,
): DriftResult {
  const findings: DriftFinding[] = [];
  const programs = facts.programs ?? {};
  const havePrices = Object.keys(products).length > 0;
  for (const [program, spec] of Object.entries(programs)) {
    if (havePrices) findings.push(...checkPrice(program, spec, products));
    findings.push(...checkKb(program, spec, kb));
  }
  return { checked: Object.keys(programs).length, findings };
}

export function detectCatalogPackDrift(
  snapshot: CatalogSnapshot,
  pack: string,
  kb: string,
): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const digest = snapshot.catalog_sha256;
  const revision = snapshot.catalog_revision;
  const totals = snapshot.pathway_totals;
  if (
    snapshot.catalog_id !== 'practitioner-series' ||
    !digest?.match(/^[a-f0-9]{64}$/) ||
    !Number.isInteger(revision) ||
    totals?.approved_programs !== 6 ||
    totals.total_hours !== 150 ||
    totals.core_competency !== 77 ||
    totals.resource_development !== 73
  ) {
    findings.push({
      program: 'practitioner-series',
      kind: 'catalog_invalid',
      detail:
        'pinned Practitioner catalog identity, revision, hash, or totals are invalid',
    });
    return findings;
  }
  const marker = `program-facts: practitioner-series revision=${revision} sha256=${digest}`;
  if (!pack.includes(marker)) {
    findings.push({
      program: 'practitioner-series',
      kind: 'catalog_invalid',
      detail: 'pinned minion pack does not match the catalog revision/hash',
    });
  }
  if (!kb.includes(pack.trim())) {
    findings.push({
      program: 'practitioner-series',
      kind: 'kb_catalog_missing',
      detail: 'sales KB is missing the exact canonical Practitioner fact pack',
    });
  }
  return findings;
}

export async function runProgramFactsDrift(): Promise<DriftResult> {
  const facts = parseYaml(
    fs.readFileSync(resolveFactsPath(), 'utf-8'),
  ) as FactsFile;
  const kb = fs.readFileSync(resolveKbPath(), 'utf-8');

  let products: Record<string, ProductEntry> = {};
  let productsError: string | null = null;
  try {
    products = JSON.parse(fs.readFileSync(resolveProductsPath(), 'utf-8'));
  } catch {
    productsError = `products.json unreadable at ${resolveProductsPath()} — price checks skipped`;
  }

  const result = detectDrift(facts, kb, products);
  if (productsError) {
    result.findings.push({
      program: '(all)',
      kind: 'product_missing',
      detail: productsError,
    });
  }
  try {
    const snapshot = JSON.parse(
      fs.readFileSync(resolvePractitionerCatalogPath(), 'utf-8'),
    ) as CatalogSnapshot;
    const pack = fs.readFileSync(resolvePractitionerPackPath(), 'utf-8');
    result.findings.push(...detectCatalogPackDrift(snapshot, pack, kb));
    result.checked += 1;
  } catch {
    result.findings.push({
      program: 'practitioner-series',
      kind: 'catalog_missing',
      detail:
        'pinned Practitioner catalog/pack is unreadable; run tools/sync-program-facts.py sync',
    });
  }
  return result;
}
