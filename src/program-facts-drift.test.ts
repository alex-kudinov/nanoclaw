import { describe, it, expect } from 'vitest';

import { detectDrift, type ProgramSpec } from './program-facts-drift.js';

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
    const products = { ...goodProducts, 'mcs-thu': { price_cents: 199700, active: true } };
    const r = detectDrift(facts, goodKb, products);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ program: 'mcs-practicum', kind: 'price_mismatch' });
    expect(r.findings[0].detail).toContain('$1,997');
  });

  it('flags a missing product id', () => {
    const products = { 'mcs-fri': { price_cents: 299700, active: true } };
    const r = detectDrift(facts, goodKb, products);
    expect(r.findings.some((f) => f.kind === 'product_missing')).toBe(true);
  });

  it('flags an inactive (retired) product', () => {
    const products = { ...goodProducts, 'mcs-fri': { price_cents: 299700, active: false } };
    const r = detectDrift(facts, goodKb, products);
    expect(r.findings.some((f) => f.kind === 'product_inactive')).toBe(true);
  });

  it('flags a KB missing a required fact', () => {
    const r = detectDrift(facts, 'Program is $2,997 for the 71 hours.', goodProducts);
    expect(r.findings).toEqual([
      { program: 'mcs-practicum', kind: 'kb_missing_fact', detail: 'sales KB missing expected "AAMC"' },
    ]);
  });

  it('flags a KB carrying a stale value', () => {
    const staleKb = goodKb + ' Old price was $1,997.';
    const r = detectDrift(facts, staleKb, goodProducts);
    expect(r.findings.some((f) => f.kind === 'kb_stale_value' && f.detail.includes('$1,997'))).toBe(true);
  });

  it('skips price checks (no false product_missing) when products is empty', () => {
    const r = detectDrift(facts, goodKb, {});
    expect(r.findings).toEqual([]);
  });
});
