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
  | 'kb_stale_value';

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
  return result;
}
