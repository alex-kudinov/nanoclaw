import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  validateCanonicalProductSlug,
  preferredProductName,
  buildPsqlVarArgs,
  formatPaymentSummary,
  derivePaymentFulfillmentOutcome,
} = require('./process-payment.cjs');

describe('formatPaymentSummary', () => {
  it('leads with the human payment event and moves diagnostics to the end', () => {
    const summary = formatPaymentSummary({
      customerName: 'Lin Chen',
      customerEmail: 'lin@example.com',
      productName: 'Mentor Coaching Foundations',
      amountDollars: '999.00',
      currency: 'USD',
      feeDollars: '29.27',
      netDollars: '969.73',
      refundedCents: 0,
      transactionDate: '8/24/2026',
      recordedDate: '8/24/2026',
      accountingStripeId: 'pi_123',
      idType: 'payment_intent',
      receivedStripeId: 'pi_123',
      rosterSummary: 'Foundations → B',
      paymentLogResult: 'OK',
      studentRosterResult: 'OK',
      dbResult: 'OK',
      debug: 'keys=1 | try-0=tandem | ok-0=tandem',
      lineItemCount: 1,
    });

    expect(summary.split('\n')[0]).toBe(
      'Payment received: Lin Chen — Mentor Coaching Foundations — $999.00 USD',
    );
    expect(summary).not.toContain('(v3-debug)');
    expect(summary.split('\n').at(-1)).toBe(
      'Diagnostics: keys=1 | try-0=tandem | ok-0=tandem',
    );
  });

  it('summarizes refunds without showing an empty debug placeholder', () => {
    const summary = formatPaymentSummary({
      customerName: 'Lin',
      customerEmail: 'lin@example.com',
      productName: 'Course',
      amountDollars: '100.00',
      currency: 'USD',
      feeDollars: '3.00',
      netDollars: '97.00',
      refundedCents: 2500,
      transactionDate: '8/24/2026',
      recordedDate: '8/24/2026',
      accountingStripeId: 'pi_123',
      idType: 'payment_intent',
      receivedStripeId: 'pi_123',
      rosterSummary: 'Sales tab (unmapped product)',
      paymentLogResult: 'OK',
      studentRosterResult: 'skipped',
      dbResult: 'OK',
      debug: 'no-debug',
      lineItemCount: 1,
    });

    expect(summary.split('\n')[0]).toBe(
      'Payment received: Lin — Course — $100.00 USD; $25.00 refunded',
    );
    expect(summary).not.toContain('Diagnostics:');
  });
});

// Tandem's checkout writes the canonical website product slug into the
// underlying PaymentIntent's metadata.product key. Only a validated shape may
// reach Chaos; anything else must fail closed to null, never pass through.
describe('validateCanonicalProductSlug', () => {
  it('accepts real website product slugs', () => {
    expect(validateCanonicalProductSlug('mcq-program-a-foundations')).toBe(
      'mcq-program-a-foundations',
    );
    expect(validateCanonicalProductSlug('supervision-inaugural')).toBe(
      'supervision-inaugural',
    );
    expect(validateCanonicalProductSlug('acc-full')).toBe('acc-full');
  });

  it('trims surrounding whitespace', () => {
    expect(validateCanonicalProductSlug('  acc-full  ')).toBe('acc-full');
  });

  it('rejects missing or blank metadata', () => {
    expect(validateCanonicalProductSlug(undefined)).toBeNull();
    expect(validateCanonicalProductSlug(null)).toBeNull();
    expect(validateCanonicalProductSlug('')).toBeNull();
    expect(validateCanonicalProductSlug('   ')).toBeNull();
  });

  it('rejects uppercase, spaces, and underscores (not the checkout shape)', () => {
    expect(validateCanonicalProductSlug('ACC-Full')).toBeNull();
    expect(validateCanonicalProductSlug('acc full')).toBeNull();
    expect(validateCanonicalProductSlug('acc_full')).toBeNull();
  });

  it('rejects a leading or trailing hyphen', () => {
    expect(validateCanonicalProductSlug('-acc-full')).toBeNull();
    expect(validateCanonicalProductSlug('acc-full-')).toBeNull();
  });

  // The class of arbitrary text this gate must never wave through: literal
  // Stripe product-name junk, HTML, and shell/SQL metacharacters.
  it('rejects arbitrary caller-controlled text', () => {
    expect(
      validateCanonicalProductSlug('<script>alert(1)</script>'),
    ).toBeNull();
    expect(validateCanonicalProductSlug('Invoice #tca-371-pl')).toBeNull();
    expect(validateCanonicalProductSlug('$(whoami)')).toBeNull();
    expect(
      validateCanonicalProductSlug("'; DROP TABLE payments; --"),
    ).toBeNull();
    expect(validateCanonicalProductSlug('coaching ($999/mo x4)')).toBeNull();
  });

  it('rejects an over-long value', () => {
    expect(validateCanonicalProductSlug('a'.repeat(192))).toBeNull();
    expect(validateCanonicalProductSlug('a'.repeat(191))).toBe('a'.repeat(191));
  });
});

// Now that a Checkout event (cs_) and its PaymentIntent twin (pi_) converge on
// one accounting row, the second writer must not degrade what the first
// recorded — regardless of which one arrives first.
describe('preferredProductName (event arrival order + product preservation)', () => {
  const REAL = 'MCQ Program A Foundations';
  const PI = 'payment_intent.succeeded';
  const CHECKOUT = 'checkout.session.completed';

  it('checkout-then-intent: the intent half must not overwrite the real product', () => {
    expect(preferredProductName('Unknown', REAL, PI)).toBe(REAL);
    expect(preferredProductName('Individual Mentor Coaching', REAL, PI)).toBe(
      REAL,
    );
  });

  it('intent-then-checkout: the checkout half may correct whatever is there', () => {
    expect(preferredProductName(REAL, 'Unknown', CHECKOUT)).toBe(REAL);
    expect(preferredProductName(REAL, 'something stale', CHECKOUT)).toBe(REAL);
  });

  it('fills a blank or Unknown cell from either event', () => {
    expect(preferredProductName('Anything', '', PI)).toBe('Anything');
    expect(preferredProductName('Anything', 'Unknown', PI)).toBe('Anything');
    expect(preferredProductName('Anything', 'unknown', PI)).toBe('Anything');
  });

  it('ignores surrounding whitespace when judging the existing value', () => {
    expect(preferredProductName('Unknown', `  ${REAL}  `, PI)).toBe(REAL);
    expect(preferredProductName('Anything', '   ', PI)).toBe('Anything');
  });
});

// The regression this change exists to prevent: a shell-built command let the
// SHELL expand `$999`, `$(...)`, and backticks before psql ever saw them.
// execFileSync + psql -v removes the shell entirely; this proves the JS layer
// hands each value through as one inert argv element, not a concatenated
// string.
describe('buildPsqlVarArgs (literal $/quotes/command-like product names)', () => {
  it('passes a literal dollar-amount product name through unmodified', () => {
    const args = buildPsqlVarArgs({ product: 'MCS Installment ($999/mo x4)' });
    expect(args).toEqual(['-v', 'product=MCS Installment ($999/mo x4)']);
  });

  it('passes a single-quoted name through unmodified (no escaping performed here)', () => {
    const args = buildPsqlVarArgs({ name: "O'Brien" });
    expect(args).toEqual(['-v', "name=O'Brien"]);
  });

  it('passes a command-substitution-shaped name through unmodified', () => {
    const args = buildPsqlVarArgs({ product: '$(whoami)' });
    expect(args).toEqual(['-v', 'product=$(whoami)']);
  });

  it('passes a backtick-shaped name through unmodified', () => {
    const args = buildPsqlVarArgs({ product: '`rm -rf /`' });
    expect(args).toEqual(['-v', 'product=`rm -rf /`']);
  });

  it('builds one -v pair per param, each as its own argv elements', () => {
    const args = buildPsqlVarArgs({ email: 'a@b.com', amount: '29900' });
    expect(args).toEqual(['-v', 'email=a@b.com', '-v', 'amount=29900']);
  });

  it('renders a null/undefined value as an empty string, never "null"/"undefined"', () => {
    expect(buildPsqlVarArgs({ prodid: null })).toEqual(['-v', 'prodid=']);
    expect(buildPsqlVarArgs({ prodid: undefined })).toEqual(['-v', 'prodid=']);
  });
});

describe('derivePaymentFulfillmentOutcome', () => {
  it('requires exact Payment Log, Postgres, and roster readback for completion', () => {
    expect(
      derivePaymentFulfillmentOutcome({
        paymentLogVerified: true,
        postgresVerified: true,
        rosterMode: 'mapped_verified',
      }),
    ).toMatchObject({ state: 'complete', errorCode: null });
  });

  it('turns an unmapped product into an owned exception', () => {
    expect(
      derivePaymentFulfillmentOutcome({
        paymentLogVerified: true,
        postgresVerified: true,
        rosterMode: 'unmapped_product',
      }),
    ).toMatchObject({
      state: 'needs_product',
      errorCode: 'product_mapping_missing',
    });
  });

  it('keeps missing student identity explicit', () => {
    expect(
      derivePaymentFulfillmentOutcome({
        paymentLogVerified: true,
        postgresVerified: true,
        rosterMode: 'missing_student',
      }),
    ).toMatchObject({
      state: 'needs_student',
      errorCode: 'student_identity_missing',
    });
  });

  it.each([
    [false, true, 'mapped_verified', 'payment_log_readback_failed'],
    [true, false, 'mapped_verified', 'postgres_payment_readback_failed'],
    [true, true, 'write_failed', 'student_roster_readback_failed'],
  ])(
    'turns missing stage readback into write_failed',
    (paymentLogVerified, postgresVerified, rosterMode, errorCode) => {
      expect(
        derivePaymentFulfillmentOutcome({
          paymentLogVerified,
          postgresVerified,
          rosterMode,
        }),
      ).toMatchObject({ state: 'write_failed', errorCode });
    },
  );
});
