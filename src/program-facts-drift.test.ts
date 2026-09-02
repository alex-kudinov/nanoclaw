import { afterEach, describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

import {
  buildProgramFactsDetectorEvidence,
  detectCoachingSupervisionCatalogDrift,
  detectDrift,
  detectMcsLocalesCatalogDrift,
  detectPractitionerCatalogDrift,
  resolveCoachingSupervisionCatalogPath,
  resolveCoachingSupervisionPackPath,
  resolveFactsPath,
  resolveKbPath,
  resolveMcsLocalesCatalogPath,
  resolveMcsLocalesPackPath,
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
      `${process.cwd()}/knowledge/agents/sales/KNOWLEDGE.md`,
    );
    expect(resolvePractitionerCatalogPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/practitioner-series.web.json',
    );
    expect(resolvePractitionerPackPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/practitioner-series.minion.md',
    );
    expect(resolveMcsLocalesCatalogPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/mcs-foundations-locales.json',
    );
    expect(resolveMcsLocalesPackPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/mcs-foundations-locales.minion.md',
    );
    expect(resolveCoachingSupervisionCatalogPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/coaching-supervision-mastery.json',
    );
    expect(resolveCoachingSupervisionPackPath()).toBe(
      '/tmp/nanoclaw-release/facts/catalogs/coaching-supervision-mastery.minion.md',
    );
  });
});

describe('detectCoachingSupervisionCatalogDrift', () => {
  const catalog = JSON.stringify({
    catalog_id: 'coaching-supervision-mastery',
    catalog_revision: 1,
    program: { status: 'live_enrolling' },
    accreditation: {
      program_level:
        'ICF Advanced Accreditation in Coaching Supervision (AACS)',
    },
    checkout_expectations: [
      {
        product: 'supervision-inaugural',
        price_cents: 399600,
        active: true,
      },
      {
        product: 'supervision-regular',
        price_cents: 479600,
        active: false,
      },
    ],
    stale_claims: [
      'The program is PRE-LAUNCH / in development — a founding cohort is forming.',
      'Do NOT quote a student price — none is public.',
      'Capture founding-cohort interest — no date, no price promised.',
      'Status: founding cohort / interest capture — no price quote.',
    ],
  });
  const digest = createHash('sha256').update(catalog).digest('hex');
  const pack = `## Canonical Coaching Supervision Mastery Facts

<!-- program-facts: coaching-supervision-mastery revision=1 sha256=${digest} -->

Live and enrolling.`;
  const kb = `# Sales

<!-- BEGIN CANONICAL PROGRAM FACTS: coaching-supervision-mastery -->
${pack}
<!-- END CANONICAL PROGRAM FACTS: coaching-supervision-mastery -->`;
  const products = {
    'supervision-inaugural': { price_cents: 399600, active: true },
    'supervision-regular': { price_cents: 479600, active: false },
  };

  it('accepts the exact live catalog, pack, checkout state, and Sales block', () => {
    expect(
      detectCoachingSupervisionCatalogDrift(catalog, pack, kb, products),
    ).toEqual({ checked: 1, findings: [] });
  });

  it('fails closed on stale pre-launch copy even when the canonical block exists', () => {
    expect(
      detectCoachingSupervisionCatalogDrift(
        catalog,
        pack,
        `${kb}\nThe program is PRE-LAUNCH / in development — a founding cohort is forming.`,
        products,
      ).findings,
    ).toEqual([
      expect.objectContaining({
        kind: 'catalog_kb_mismatch',
        detail: expect.stringContaining('1 stale'),
      }),
    ]);
  });

  it('flags checkout price or active-state drift', () => {
    expect(
      detectCoachingSupervisionCatalogDrift(catalog, pack, kb, {
        ...products,
        'supervision-inaugural': { price_cents: 399600, active: false },
      }).findings,
    ).toEqual([
      expect.objectContaining({
        kind: 'price_mismatch',
        detail: expect.stringContaining('supervision-inaugural'),
      }),
    ]);
  });

  it('refuses a missing catalog, malformed authority, or stale pack hash', () => {
    expect(
      detectCoachingSupervisionCatalogDrift(null, pack, kb, products).findings,
    ).toEqual([expect.objectContaining({ kind: 'catalog_missing' })]);
    expect(
      detectCoachingSupervisionCatalogDrift('{}', pack, kb, products).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'catalog_pack_mismatch' }),
      ]),
    );
    expect(
      detectCoachingSupervisionCatalogDrift(
        catalog,
        pack.replace(digest, '0'.repeat(64)),
        kb,
        products,
      ).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'catalog_pack_mismatch' }),
      ]),
    );
  });
});

describe('detectMcsLocalesCatalogDrift', () => {
  const catalog = JSON.stringify({
    catalog_id: 'mcs-foundations-locales',
    catalog_revision: 1,
    locales: ['English', 'French', 'Japanese', 'Spanish'].map((language) => ({
      language,
    })),
  });
  const digest = createHash('sha256').update(catalog).digest('hex');
  const pack = `## Canonical Mentor Coaching Foundations Language Availability

<!-- program-facts: mcs-foundations-locales revision=1 sha256=${digest} -->

English, French, Japanese, and Spanish.`;
  const kb = `# Sales

<!-- BEGIN CANONICAL PROGRAM FACTS: mcs-foundations-locales -->
${pack}
<!-- END CANONICAL PROGRAM FACTS: mcs-foundations-locales -->`;

  it('accepts an exact catalog, hash-bound pack, and Sales KB block', () => {
    expect(detectMcsLocalesCatalogDrift(catalog, pack, kb)).toEqual({
      checked: 1,
      findings: [],
    });
  });

  it('fails closed when the catalog or pack is unavailable', () => {
    expect(detectMcsLocalesCatalogDrift(null, pack, kb).findings).toEqual([
      expect.objectContaining({ kind: 'catalog_missing' }),
    ]);
  });

  it('flags a stale pack hash or incomplete language set', () => {
    const stalePack = pack.replace(digest, '0'.repeat(64));
    expect(
      detectMcsLocalesCatalogDrift(catalog, stalePack, kb).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'catalog_pack_mismatch' }),
      ]),
    );
    const incompleteCatalog = JSON.stringify({
      catalog_id: 'mcs-foundations-locales',
      catalog_revision: 1,
      locales: [{ language: 'English' }, { language: 'French' }],
    });
    expect(
      detectMcsLocalesCatalogDrift(incompleteCatalog, pack, kb).findings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'catalog_pack_mismatch' }),
      ]),
    );
  });

  it.each([
    ['object', { French: true }],
    ['string', 'English,French,Japanese,Spanish'],
    ['number', 4],
    ['array entry', [null, 'French', {}, []]],
  ])(
    'returns drift instead of throwing for malformed %s locales',
    (_name, locales) => {
      const malformed = JSON.stringify({
        catalog_id: 'mcs-foundations-locales',
        catalog_revision: 1,
        locales,
      });
      expect(() =>
        detectMcsLocalesCatalogDrift(malformed, pack, kb),
      ).not.toThrow();
      expect(
        detectMcsLocalesCatalogDrift(malformed, pack, kb).findings,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'catalog_pack_mismatch' }),
        ]),
      );
    },
  );

  it('hashes the exact catalog bytes when production supplies a Buffer', () => {
    expect(
      detectMcsLocalesCatalogDrift(Buffer.from(catalog, 'utf8'), pack, kb),
    ).toEqual({ checked: 1, findings: [] });
  });

  it('flags a Sales KB missing the exact generated block', () => {
    expect(
      detectMcsLocalesCatalogDrift(catalog, pack, '# Sales').findings,
    ).toEqual([expect.objectContaining({ kind: 'catalog_kb_mismatch' })]);
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
