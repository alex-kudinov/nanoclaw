# Re-review the channel-authentication correction

Read only:
- `docs/reports/NC-20260906-009-CLAUDE-RESPONSE-R1.md`
- `docs/reports/NC-20260906-009-CORRECTION-EVIDENCE-R2.md`
- `src/student-enrollment-admission.ts`

Write `docs/reports/NC-20260906-009-CLAUDE-RESPONSE-R2.md` with remaining material
findings or NO MATERIAL FINDINGS and the R1 disposition. Read/Write only; no
other reads, source edits, Bash/web/MCP, credentials, real data or production.
Read each once, at most six tool calls, then stop. Sonnet/high bounded review.

Codex checked R1 independently. Two claims were incorrect: the predecessor
already bound channel in commercial/participant/assignment proofs; and its
migration/correction route always returned an owned review case with no student
materialization. Actual PostgreSQL reproduction against a legacy claim confirmed
zero new enrollments and unchanged legacy ownership/effect. The evidence includes
the exact predecessor code and regression, not just a counter-assertion.

There WAS a narrower verified gap: funding-only authentication did not bind the
routing channel. A regression expecting rejection failed before correction.
The following load-bearing correction now closes it without turning review
requests into funding ownership or blocking a legitimate legacy effect:

1. Every signed statement explicitly includes channel, checked against both the
   parsed envelope and the issuer's immutable allowed-channel list.
2. Provider issuers cannot register migration/correction channels; grant-channel
   issuers require owner_admin. Operator correction requests may request review
   but still cannot execute a migration or change a student.
3. The correction branch now explicitly calls the local non-mutating
   admissionHold helper; it never calls the ingress engine or writer claim.
   It adds an owned correction_requires_resolution case and authentication audit
   only. This makes the no-student-effects guarantee independent of future
   changes to the predecessor correction path.
4. Tests cover funding-only channel tampering, issuer-channel restrictions,
   configuration copying and correction review against an existing legacy claim
   with unchanged enrollments/entitlements/assignments/projections/capacity.

Focused tests now pass 159/159 (19 admission tests plus predecessor/store checks),
including real disposable PostgreSQL, with root and strict worker typechecks.
No deployment, real provider/native binding, historical access, credentials,
financial action or communication. Local/pilot scope and all other reviewed
mechanics remain unchanged. Review only this correction and its interactions;
do not reopen the separately unauthorized production pilot.
