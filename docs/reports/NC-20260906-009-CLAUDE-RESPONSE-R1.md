# Independent bounded authenticated-admission review — response R1

Scope: `src/student-enrollment-admission.ts`, `scripts/enrollment-admission-fixtures.mjs`,
`scripts/student-enrollment-admission-disposable-worker.ts`,
`docs/reports/NC-20260906-009-CRITICAL-DIFF.md`. Read/write only, no other
tool use beyond this review.

## Material finding: `channel === 'migration_or_correction'` unauthenticated bypass of the legacy/new writer exclusion

**Severity: material — defeats the "shared legacy/new exclusion" guarantee this feature exists to provide.**

### Evidence

`src/student-enrollment-admission.ts`, `admit()`:

```ts
if (!(await recordAuthenticatedReceipts(...)))
  result = admissionHold(state, e, at, 'authenticated_receipt_conflict');
else if (
  e.channel !== 'migration_or_correction' &&
  !(await claimEnrollmentWriter(client, e.funding.source, 'enrollment', ...))
)
  result = admissionHold(state, e, at, 'writer_ownership_conflict');
else
  result = applyEnrollmentIngress(state, e, { proofs: verified.proofs, catalog: {...} });
```

When `e.channel === 'migration_or_correction'`, the `&&` short-circuits and
`claimEnrollmentWriter` is never called. Control falls straight to
`applyEnrollmentIngress`, regardless of any pre-existing entry in
`business_v2.student_enrollment_writer_claims` for the same funding source.

`e.channel` is **not** authenticated by any signed statement. In `verify()`,
the only proof targets registered via `add()` are `e.funding.proofKey`,
`e.commercial.proofKey`, and each seat's `proofKey`/`assignment.proofKey`
(lines building the `expected` map). None of these bind `e.channel`, and the
`statementSchema` carries no channel field either. `channel` is plain
envelope data supplied by whichever caller assembles the candidate — an
attacker or a misconfigured/compromised `source_adapter` or
`finance_operator` issuer that can produce a validly-signed `funding` proof
(required unconditionally via `authenticated_funding_required`) controls
`e.channel` freely without it affecting any MAC.

### Impact

For any envelope labeled `migration_or_correction`:
- No row is ever written to `student_enrollment_writer_claims` for that
  source, so a concurrent or subsequent `legacy()` claim for the same
  underlying funding source proceeds independently and successfully.
- If a `legacy` claim for that source **already exists**, the
  `migration_or_correction`-labeled admission still reaches
  `applyEnrollmentIngress` and materializes a new enrollment for the same
  source — the exact double-write the writer-claim mechanism (migration 147,
  `claimEnrollmentWriter`) is designed to prevent, and which the request
  explicitly names as an evaluation criterion ("old-writer exclusion").
- This is reachable by exactly the same caller/credentials that produce any
  other admission — no owner_admin or elevated role is required to set
  `channel`.

### Coverage gap corroborating the finding

`scripts/student-enrollment-admission-disposable-worker.ts` never exercises
`channel === 'migration_or_correction'`; every fixture channel value is
`website_stripe_checkout`, `manual_stripe_payment`, `scholarship`, or
`sponsored_cohort` (`scripts/enrollment-admission-fixtures.mjs`). The
dual-writer race test (`summary.dualWriterRace`) and the legacy-block test
(`summary.legacyBlocked`) both use the default channel, so they never
traverse this branch. The bypass path is both unauthenticated and untested.

### Reproduction (structural, from the bounded artifacts)

1. Build a fixture via `admissionFixture(...)`, run `legacy(f)` first so
   `student_enrollment_writer_claims` records `writer='legacy'` for
   `f.envelope.funding.source`.
2. Take a second envelope for the *same* `funding.source` (or reuse `f`),
   set `envelope.channel = 'migration_or_correction'`, re-sign with
   `signAdmissionFixtures`, and call `gate.verify(...)` / `gate.admit(...)`.
3. `claimEnrollmentWriter` is never invoked; `admit()` proceeds to
   `applyEnrollmentIngress` and returns `disposition: 'accepted'` (or
   `duplicate` only if the *new*-writer order key already matches — it will
   not, since no prior new-writer order exists), producing a second,
   uncoordinated enrollment alongside the legacy writer's effect.

### Recommendation

Either bind `channel` into an authenticated proof target (so only an
issuer with a role authorized to assert `migration_or_correction` — e.g.
`owner_admin` — can set it), or remove the short-circuit and instead have
`claimEnrollmentWriter` itself branch on an authenticated (proof-bound)
migration flag before skipping the claim. Add a worker/unit test that
exercises this channel value against an existing legacy claim.

No other material findings in the bounded artifacts.
