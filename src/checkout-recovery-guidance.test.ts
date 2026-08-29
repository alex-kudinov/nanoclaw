import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

import { checkoutRecoveryCustomerCopy } from './checkout-recovery-guidance.js';
import type {
  CheckoutFailureGuidanceKey,
  CheckoutRecoveryLocale,
} from './checkout-recovery.js';

const locales: CheckoutRecoveryLocale[] = ['en', 'es', 'fr', 'ja'];
const keys: CheckoutFailureGuidanceKey[] = [
  'verify_card_details',
  'authenticate_payment',
  'use_different_method',
  'contact_issuer_or_change_method',
  'retry_later_or_change_method',
  'generic_decline',
];

describe('checkout recovery customer copy', () => {
  it('provides complete localized remediation for every safe guidance key', () => {
    for (const locale of locales) {
      for (const guidanceKey of keys) {
        const copy = checkoutRecoveryCustomerCopy({
          locale,
          guidanceKey,
          touch: 1,
        });
        expect(copy.subject.length).toBeGreaterThan(5);
        expect(copy.title.length).toBeGreaterThan(5);
        expect(copy.body.length).toBeGreaterThan(30);
        expect(copy.supportUrl).toMatch(/^https:\/\/tandemcoach\.co\//);
        expect(copy).toMatchObject({ guidanceKey, failureSpecific: true });
        expect(JSON.stringify(copy)).not.toMatch(
          /do_not_honor|fraudulent|stolen_card|decline_code|failure_code/i,
        );
      }
    }
  });

  it('keeps generic abandonment distinct and touch two human', () => {
    const touchOne = checkoutRecoveryCustomerCopy({
      locale: 'en',
      guidanceKey: null,
      touch: 1,
    });
    const touchTwo = checkoutRecoveryCustomerCopy({
      locale: 'en',
      guidanceKey: null,
      touch: 2,
    });
    expect(touchOne).toMatchObject({
      guidanceKey: 'checkout_incomplete',
      failureSpecific: false,
    });
    expect(touchTwo.subject).not.toBe(touchOne.subject);
    expect(touchTwo.body.toLowerCase()).toContain('reply');
  });

  it('keeps every tracked provider template on the safe person-field contract', () => {
    const root = path.join(
      process.cwd(),
      'docs/programs/company-os/provider-assets/checkout-recovery',
    );
    for (const locale of ['en', 'es', 'fr', 'ja']) {
      for (const touch of [1, 2]) {
        const html = fs.readFileSync(
          path.join(root, `${locale}-touch-${touch}.html`),
          'utf8',
        );
        for (const field of [
          'checkout_recovery_subject',
          'checkout_recovery_product_name',
          'checkout_recovery_return_url',
          'checkout_recovery_guidance_title',
          'checkout_recovery_guidance_body',
          'checkout_recovery_support_url',
          'managePreferencesURL',
          'unsubscribeURL',
        ]) {
          expect(html).toContain(`{{person.${field}`);
        }
        expect(html).not.toMatch(
          /do_not_honor|decline_code|advice_code|result\.error/i,
        );
      }
    }
  });
});
