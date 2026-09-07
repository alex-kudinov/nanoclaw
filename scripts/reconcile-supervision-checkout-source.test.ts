import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// @ts-expect-error release helper is deliberately plain ESM.
import { planReconciliation } from './reconcile-supervision-checkout-source.mjs';

const roots: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'supervision-source-repair-'),
  );
  roots.push(root);
  const products = {
    _meta: { untouched: true },
    'unselected-product': { active: false, note: 'preserve bytes and fields' },
    'supervision-inaugural': {
      name: 'Inaugural',
      price_cents: 399600,
      active: true,
      custom_welcome: true,
      installments: { count: 4, amount_cents: 99900 },
    },
    'supervision-regular': {
      name: 'Regular',
      price_cents: 479600,
      active: false,
      custom_welcome: true,
      installments: { count: 4, amount_cents: 119900 },
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(products, null, 2)}\n`);
  return {
    bytes,
    hash: crypto.createHash('sha256').update(bytes).digest('hex'),
    products,
  };
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

describe('supervision checkout source reconciliation', () => {
  it('changes only the seven accepted fields and preserves all other data', () => {
    const source = fixture();
    const plan = planReconciliation(source.bytes, source.hash);
    const after = JSON.parse(plan.bytes.toString('utf8'));

    expect(after._meta).toEqual(source.products._meta);
    expect(after['unselected-product']).toEqual(
      source.products['unselected-product'],
    );
    expect(after['supervision-inaugural']).toMatchObject({
      active: true,
      requires_cohort: true,
      cohort_program: 'supervision',
      cohort_start_dates: ['2026-10-07'],
      custom_welcome: true,
    });
    expect(after['supervision-regular']).toMatchObject({
      active: true,
      requires_cohort: true,
      cohort_program: 'supervision',
      cohort_excluded_start_dates: ['2026-10-07'],
      custom_welcome: true,
    });
    expect(plan.before_sha256).toBe(source.hash);
    expect(plan.after_sha256).not.toBe(source.hash);
  });

  it('rejects a whole-file concurrency mismatch', () => {
    const source = fixture();
    expect(() => planReconciliation(source.bytes, '0'.repeat(64))).toThrowError(
      expect.objectContaining({ code: 'whole_file_precondition_mismatch' }),
    );
  });

  it('rejects an independent active-state edit', () => {
    const source = fixture();
    source.products['supervision-regular'].active = true;
    const bytes = Buffer.from(`${JSON.stringify(source.products, null, 2)}\n`);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(() => planReconciliation(bytes, hash)).toThrowError(
      expect.objectContaining({ code: 'selected_precondition_mismatch' }),
    );
  });

  it('rejects pre-existing cohort fields instead of overwriting them', () => {
    const source = fixture();
    source.products['supervision-inaugural'].cohort_program =
      'independent-edit';
    const bytes = Buffer.from(`${JSON.stringify(source.products, null, 2)}\n`);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    expect(() => planReconciliation(bytes, hash)).toThrowError(
      expect.objectContaining({ code: 'selected_precondition_mismatch' }),
    );
  });
});
