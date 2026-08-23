import { afterEach, describe, it, expect } from 'vitest';

import {
  buildProgramFactsDetectorEvidence,
  detectDrift,
  detectPractitionerCatalogDrift,
  resolveFactsPath,
  resolveKbPath,
  resolvePractitionerCatalogPath,
  resolvePractitionerPackPath,
  type ProgramSpec,
} from './program-facts-drift.js';

const originalCodeRoot = process.env.NANOCLAW_CODE_ROOT;

afterEach(() => {
  if (originalCodeRoot === undefined) delete process.env.NANOCLAW_CODE_ROOT;
  else process.env.NANOCLAW_CODE_ROOT = originalCodeRoot;
});

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

describe('release-owned detector inputs', () => {
  it('resolves tracked facts and knowledge from the immutable release root', () => {
    process.env.NANOCLAW_CODE_ROOT = '/tmp/nanoclaw-release';
    expect(resolveFactsPath()).toBe(
      '/tmp/nanoclaw-release/facts/programs.yaml',
    );
    expect(resolveKbPath()).toBe(
      '/tmp/nanoclaw-release/knowledge/agents/sales/KNOWLEDGE.md',
    );
    expect(resolvePractitionerCatalogPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/practitioner-series.web.json',
    );
    expect(resolvePractitionerPackPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/practitioner-series.minion.md',
    );
  });
});

describe('detectPractitionerCatalogDrift', () => {
  const digest = 'd'.repeat(64);
  const catalog = JSON.stringify({
    catalog_revision: 2,
    catalog_sha256: digest,
    programs: [
      {
        superseded_claims: [
          { claim: '20 hours: 15 Core Competency + 5 Resource Development' },
        ],
      },
    ],
  });
  const pack = `## Canonical Practitioner Series Facts

<!-- program-facts: practitioner-series revision=2 sha256=${digest} -->

Current truth.`;
  const kb = `# Sales

<!-- BEGIN CANONICAL PROGRAM FACTS: practitioner-series -->
${pack}
<!-- END CANONICAL PROGRAM FACTS: practitioner-series -->`;

  it('accepts an exact catalog, pack, and Sales KB block', () => {
    expect(detectPractitionerCatalogDrift(catalog, pack, kb)).toEqual({
      checked: 1,
      findings: [],
    });
  });

  it('fails closed when the pinned files are unavailable', () => {
    expect(detectPractitionerCatalogDrift(null, pack, kb).findings).toEqual([
      expect.objectContaining({ kind: 'catalog_missing' }),
    ]);
  });

  it('flags a catalog/pack revision or hash mismatch', () => {
    const stalePack = pack.replace('revision=2', 'revision=1');
    expect(
      detectPractitionerCatalogDrift(catalog, stalePack, kb).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'catalog_pack_mismatch',
        }),
      ]),
    );
  });

  it('flags a Sales KB that lacks the exact generated pack', () => {
    expect(
      detectPractitionerCatalogDrift(catalog, pack, '# Sales').findings,
    ).toEqual([expect.objectContaining({ kind: 'catalog_kb_mismatch' })]);
  });

  it('flags catalog-superseded copy even when the exact current block exists', () => {
    const staleKb = `${kb}\n20 hours: 15 Core Competency + 5 Resource Development`;
    expect(
      detectPractitionerCatalogDrift(catalog, pack, staleKb).findings,
    ).toEqual([
      expect.objectContaining({
        kind: 'catalog_kb_mismatch',
        detail: expect.stringContaining('1 catalog-superseded'),
      }),
    ]);
  });
});

describe('program-facts durable detector evidence', () => {
  it('is stable across finding order but changes with any source version', () => {
    const findings = [
      {
        program: 'b',
        kind: 'kb_missing_fact' as const,
        detail: 'missing b',
      },
      {
        program: 'a',
        kind: 'kb_stale_value' as const,
        detail: 'stale a',
      },
    ];
    const sources = {
      facts: 'facts-v1',
      salesKb: 'kb-v1',
      products: '{"version":1}',
    };
    const first = buildProgramFactsDetectorEvidence(
      { checked: 2, findings },
      sources,
    );
    const reordered = buildProgramFactsDetectorEvidence(
      { checked: 2, findings: [...findings].reverse() },
      sources,
    );
    const changed = buildProgramFactsDetectorEvidence(
      { checked: 2, findings },
      { ...sources, salesKb: 'kb-v2' },
    );

    expect(reordered).toEqual(first);
    expect(changed.findingFingerprint).toBe(first.findingFingerprint);
    expect(changed.salesKbSha256).not.toBe(first.salesKbSha256);
    expect(changed.payloadSha256).not.toBe(first.payloadSha256);
    for (const digest of [
      first.factsSha256,
      first.salesKbSha256,
      first.productsSha256,
      first.findingFingerprint,
      first.payloadSha256,
    ]) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('records an unavailable products source without inventing a source hash', () => {
    const evidence = buildProgramFactsDetectorEvidence(
      { checked: 1, findings: [] },
      { facts: 'facts', salesKb: 'kb', products: null },
    );
    expect(evidence).toMatchObject({
      productsAvailable: false,
      productsSha256: null,
    });
  });
});
