# NC-20260826-003 — Trafft exact identity implementation review R1

Use Sonnet/high bounded review. Report material findings only with exact
evidence and bounded fixes. Do not edit source, use Bash/network/databases, or
inspect secrets/PII. Write only
`docs/reports/NC-20260826-003-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`.

## Objective

Permit exact Trafft customer/appointment references and current appointment
projections only for Parties provably created by Trafft after adapter
registration. Preserve every legacy/shared/mismatched identity hold. Add
exact-first future Booking resolution and one content-minimized exact-read
canary.

## Accepted facts and exclusions

- Exact live base `416384fc` contains the healthy 420-row held shadow.
- Email and historical consistency are not identity authority.
- Safe rule: post-registration Trafft-created Party; first interaction within
  five minutes; exactly one initial customer; customer maps to one Party.
- Appointment binding additionally requires its ledger Party to equal the exact
  customer-ref Party.
- No provider/customer/Plutio/credential/payment/contract write, broad minion
  grant, or adjacent lifecycle/checkout/Circle/legacy change.

## Allowed packet

1. this request;
2. `docs/RELATIONSHIP-CONTEXT-TRAFFT-EXACT-IDENTITY.md`;
3. `src/relationship-context-trafft-shadow.ts`;
4. `src/relationship-context-store.ts` only `bindExternalRef`;
5. `src/identity-join.ts` only `resolveTrafftCustomer`;
6. `src/relationship-context-live-canary.ts`;
7. `src/relationship-context-store.integration.test.ts` exact-identity test;
8. `src/relationship-context-trafft-shadow.test.ts`,
   `src/relationship-context-live-canary.test.ts`, and
   `src/identity-join.test.ts` only related cases.

## Questions

1. Can any legacy/shared/mismatched row bind or project through these rules?
2. Are concurrency, transaction rollback, ref ownership conflict, Party merge,
   replay, and late observation linking safe?
3. Can exact-first resolution redirect a customer incorrectly or regress the
   no-ref legacy fallback?
4. Is `verified_at` justified and monotonic for the strict rule?
5. Does the canary truly consume one policy grant, avoid context/identity value
   output, and record truthful delivery?
6. Are health counters truthful, and do tests prove safe, held, ambiguous,
   exact-first, current projection, replay, and delivered receipt behavior?

Return `Verdict: NO MATERIAL FINDINGS` or `Verdict: MATERIAL FINDINGS`.
