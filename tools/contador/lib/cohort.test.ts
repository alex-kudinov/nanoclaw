import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveCohortLabel, COHORT_COLUMN } = require('./cohort.cjs');

const june2026 = new Date(2026, 5, 20);

describe('resolveCohortLabel', () => {
  it('reads the current split checkout metadata contract', () => {
    expect(
      resolveCohortLabel({
        chargeMetadata: {
          product: 'mcs-full',
          cohort_program: 'mcs-practicum',
          cohort_label: 'Fridays',
          cohort_range: 'September 25 – December 18, 2026',
          cohort_start: '2026-09-25T10:00:00-04:00',
        },
        productName:
          'MCS Advanced Accreditation Mentor Coaching — Installment (/mo)',
        purchasedAt: new Date(2026, 8, 4),
      }),
    ).toBe('September 2026 – Friday');
  });

  it('uses cohort_range when the structured start timestamp is absent', () => {
    expect(
      resolveCohortLabel({
        chargeMetadata: {
          cohort_program: 'mcs-practicum',
          cohort_label: 'Thursdays',
          cohort_range: 'January 8 – March 12, 2027',
        },
        purchasedAt: new Date(2026, 10, 15),
      }),
    ).toBe('January 2027 – Thursday');
  });

  it('keeps the legacy metadata slug contract', () => {
    expect(
      resolveCohortLabel({
        chargeMetadata: { product: 'mcs-cohort-sept-thursday' },
        purchasedAt: june2026,
      }),
    ).toBe('September 2026 – Thursday');
  });

  it('reads an installment cohort from the charge description', () => {
    expect(
      resolveCohortLabel({
        chargeDescription:
          'Mentor Coach Training - September Friday Cohort (3 payments)',
        purchasedAt: new Date(2026, 7, 11),
      }),
    ).toBe('September 2026 – Friday');
  });

  it('reads a pay-in-full cohort from the product name', () => {
    expect(
      resolveCohortLabel({
        productName: 'Mentor Coach Training - September Thursday Cohort',
        purchasedAt: june2026,
      }),
    ).toBe('September 2026 – Thursday');
  });

  it('refuses partial or non-MCS structured metadata', () => {
    expect(
      resolveCohortLabel({
        chargeMetadata: {
          cohort_program: 'mcs-practicum',
          cohort_label: 'Fridays',
        },
        purchasedAt: june2026,
      }),
    ).toBe('');
    expect(
      resolveCohortLabel({
        chargeMetadata: {
          cohort_label: 'Fridays',
          cohort_start: '2026-09-25T10:00:00-04:00',
        },
        purchasedAt: june2026,
      }),
    ).toBe('');
    expect(
      resolveCohortLabel({
        chargeMetadata: {
          cohort_program: 'other-program',
          cohort_label: 'Fridays',
          cohort_start: '2026-09-25T10:00:00-04:00',
        },
        purchasedAt: june2026,
      }),
    ).toBe('');
  });

  it('derives the next year only for legacy text without an explicit year', () => {
    expect(
      resolveCohortLabel({
        productName: 'Mentor Coach Training - January Tuesday Cohort',
        purchasedAt: new Date(2026, 10, 15),
      }),
    ).toBe('January 2027 – Tuesday');
  });

  it('returns blank for unrelated product text', () => {
    expect(
      resolveCohortLabel({
        productName:
          'MCS Advanced Accreditation Mentor Coaching — Installment (/mo)',
        purchasedAt: june2026,
      }),
    ).toBe('');
    expect(
      resolveCohortLabel({
        productName: 'Friday Leadership Intensive — September 2026',
        chargeDescription: 'Friday Leadership Intensive — September 2026',
        purchasedAt: june2026,
      }),
    ).toBe('');
    expect(
      resolveCohortLabel({
        chargeMetadata: {
          cohort_program: 'other-program',
          cohort: 'September 2026 – Friday',
          product: 'mcs-cohort-sept-friday',
        },
        productName: 'Mentor Coach Training - September Friday Cohort',
        purchasedAt: june2026,
      }),
    ).toBe('');
  });
});

it('names the roster column it feeds', () => {
  expect(COHORT_COLUMN).toBe('Cohort');
});
