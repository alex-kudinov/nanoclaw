import { createHash } from 'node:crypto';

import { z } from 'zod';

import { PaymentDomainError } from './payment-domain.js';

const printable = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));

const billingProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    companyLegalName: printable(160),
    invoiceEmail: z.string().trim().toLowerCase().email().min(3).max(254),
    taxId: printable(64).nullable(),
    address: z
      .object({
        street: printable(180),
        houseNumberOrName: printable(40),
        city: printable(100),
        postalCode: printable(20),
        stateOrProvince: printable(40).nullable(),
        country: z.string().regex(/^[A-Z]{2}$/),
      })
      .strict(),
  })
  .strict();

export type CheckoutBillingProfile = Readonly<
  z.infer<typeof billingProfileSchema>
>;

export function parseCheckoutBillingProfile(
  input: unknown,
): CheckoutBillingProfile {
  const parsed = billingProfileSchema.safeParse(input);
  if (!parsed.success) throw new PaymentDomainError('invalid_billing_profile');
  if (
    ['US', 'CA'].includes(parsed.data.address.country) &&
    parsed.data.address.stateOrProvince === null
  )
    throw new PaymentDomainError('invalid_billing_profile');
  return Object.freeze({
    ...parsed.data,
    companyLegalName: parsed.data.companyLegalName.trim(),
    invoiceEmail: parsed.data.invoiceEmail.trim().toLowerCase(),
    taxId: parsed.data.taxId?.trim() || null,
    address: Object.freeze({
      ...parsed.data.address,
      street: parsed.data.address.street.trim(),
      houseNumberOrName: parsed.data.address.houseNumberOrName.trim(),
      city: parsed.data.address.city.trim(),
      postalCode: parsed.data.address.postalCode.trim(),
      stateOrProvince: parsed.data.address.stateOrProvince?.trim() || null,
    }),
  });
}

export function checkoutBillingProfileSha256(input: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(parseCheckoutBillingProfile(input)))
    .digest('hex');
}
