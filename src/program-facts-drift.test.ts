import { describe, it, expect } from 'vitest';

import {
  detectCatalogPackDrift,
  detectDrift,
  type ProgramSpec,
} from './program-facts-drift.js';

const spec: ProgramSpec = {
  name: 'MCS Practicum',
  price_usd: 2997,
  products_ids: ['mcs-thu', 'mcs-fri'],
  kb_present: ['$2,997', '71 hours', 'AAMC'],
  kb_absent: ['$1,997', '41 CCE'],
};

const facts = { programs: { 'mcs-practicum': spec } };
const goodKb = 'Program is $2,997 for the 71 hours, AAMC granted.';
const goodProducts = {
  'mcs-thu': { price_cents: 299700, active: true },
  'mcs-fri': { price_cents: 299700, active: true },
};

describe('detectDrift', () => {
  it('reports nothing when everything agrees', () => {
    const r = detectDrift(facts, goodKb, goodProducts);
    expect(r.checked).toBe(1);
    expect(r.findings).toEqual([]);
  });

  it('flags a products.json price mismatch', () => {
    const products = {
      ...goodProducts,
      'mcs-thu': { price_cents: 199700, active: true },
    };
    const r = detectDrift(facts, goodKb, products);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      program: 'mcs-practicum',
      kind: 'price_mismatch',
    });
    expect(r.findings[0].detail).toContain('$1,997');
  });

  it('flags a missing product id', () => {
    const products = { 'mcs-fri': { price_cents: 299700, active: true } };
    const r = detectDrift(facts, goodKb, products);
    expect(r.findings.some((f) => f.kind === 'product_missing')).toBe(true);
  });

  it('flags an inactive (retired) product', () => {
    const products = {
      ...goodProducts,
      'mcs-fri': { price_cents: 299700, active: false },
    };
    const r = detectDrift(facts, goodKb, products);
    expect(r.findings.some((f) => f.kind === 'product_inactive')).toBe(true);
  });

  it('flags a KB missing a required fact', () => {
    const r = detectDrift(
      facts,
      'Program is $2,997 for the 71 hours.',
      goodProducts,
    );
    expect(r.findings).toEqual([
      {
        program: 'mcs-practicum',
        kind: 'kb_missing_fact',
        detail: 'sales KB missing expected "AAMC"',
      },
    ]);
  });

  it('flags a KB carrying a stale value', () => {
    const staleKb = goodKb + ' Old price was $1,997.';
    const r = detectDrift(facts, staleKb, goodProducts);
    expect(
      r.findings.some(
        (f) => f.kind === 'kb_stale_value' && f.detail.includes('$1,997'),
      ),
    ).toBe(true);
  });

  it('skips price checks (no false product_missing) when products is empty', () => {
    const r = detectDrift(facts, goodKb, {});
    expect(r.findings).toEqual([]);
  });
});

describe('detectCatalogPackDrift', () => {
  const digest = 'a'.repeat(64);
  const snapshot = {
    catalog_id: 'practitioner-series',
    catalog_revision: 3,
    catalog_sha256: digest,
    pathway_totals: {
      approved_programs: 6,
      total_hours: 150,
      core_competency: 77,
      resource_development: 73,
    },
  };
  const pack = `## Canonical\n<!-- program-facts: practitioner-series revision=3 sha256=${digest} -->\nTruth`;

  it('accepts an exact pinned pack in the KB', () => {
    expect(
      detectCatalogPackDrift(snapshot, pack, `before\n${pack}\nafter`),
    ).toEqual([]);
  });

  it('fails when the KB lost the deterministic pack', () => {
    expect(detectCatalogPackDrift(snapshot, pack, 'stale prose')).toEqual([
      expect.objectContaining({ kind: 'kb_catalog_missing' }),
    ]);
  });

  it('fails on invalid pathway totals', () => {
    const invalid = {
      ...snapshot,
      pathway_totals: { ...snapshot.pathway_totals, total_hours: 170 },
    };
    expect(detectCatalogPackDrift(invalid, pack, pack)).toEqual([
      expect.objectContaining({ kind: 'catalog_invalid' }),
    ]);
  });
});
