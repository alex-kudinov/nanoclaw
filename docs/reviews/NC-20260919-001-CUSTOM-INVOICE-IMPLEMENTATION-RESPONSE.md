# NC-20260919-001 bounded implementation review — response

## Finding: `initialPaymentMethod` is required for ordinary finite schedules, not just custom invoice schedules

The stated invariant scopes the new selection/initial-method pairing to custom
schedules only: *"Custom schedules require ... exact selection/initial method
pair. Ordinary finite schedules remain 2–24 and monthly/quarterly/annual."*
No new required field is authorized for ordinary finite installment contracts.

The diff instead adds `initialPaymentMethod` to `contractFields`, which is
spread into **both** `finiteContractSchema` and `customInvoiceContractSchema`:

```
 const contractFields = {
   ...
+  selectionMethod: z.enum([
+    'payment_option_and_submit',
+    'apple_pay_recurring_proof',
+  ]),
+  initialPaymentMethod: z.enum(['scheme', 'applepay']),
 };
 const finiteContractSchema = z
   .object({
     ...contractFields,
     kind: z.literal('finite_installments'),
     cadence: z.enum(['monthly', 'quarterly', 'annual']),
     count: z.number().int().min(2).max(24),
     obligations: z.array(obligationSchema).min(2).max(24),
   })
   .strict();
```

`initialPaymentMethod` is not `.optional()`, and both contract schemas are
`.strict()`. The post-parse invariant check applies to `c` unconditionally
(no `kind` guard), so it also runs against ordinary finite contracts:

```
+  ensure(
+    (selectionMethod === 'payment_option_and_submit' &&
+      initialPaymentMethod === 'scheme') ||
+      (selectionMethod === 'apple_pay_recurring_proof' &&
+        initialPaymentMethod === 'applepay'),
+    'finite_billing_initial_method_conflict',
+  );
```

Any existing producer of ordinary `finite_installments` schedules that does
not send `initialPaymentMethod` (none is shown being updated in this diff)
will now fail activation — first at Zod parse (missing required key under
`.strict()`), and even if patched to send the field, again at
`finite_billing_initial_method_conflict` if the pairing doesn't match. This
is corroborated by the test diff itself: the shared `activation()` fixture,
used by pre-existing ordinary finite-billing tests, had to gain
`initialPaymentMethod: 'scheme' as const` to keep passing — confirming the
requirement is now universal, not custom-only. No corresponding change to a
production ordinary-schedule signer is present in this diff. This is a break
of existing catalog payments per the stated invariant.

**Smallest safe correction:** move `initialPaymentMethod` (and the
`selectionMethod` widening, which the invariants likewise scope only to
custom schedules) out of `contractFields` and into
`customInvoiceContractSchema` only; keep `finiteContractSchema`'s
`selectionMethod` as the original `z.literal('payment_option_and_submit')`
with no `initialPaymentMethod` key. Guard the `finite_billing_initial_method_conflict`
`ensure()` with `c.kind === 'custom_invoice_installments'` so it only runs
for custom schedules.

No other material finding (false payment truth, idempotency/rollback
weakening, roster/document side effect, or dropped accounting readback) was
found in the reviewed diff.
