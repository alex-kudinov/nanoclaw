# NC-20260907-003 Claude independent review — response R1

## Review scope receipt

Reviewer: Claude Code, Sonnet, high effort, independent (no execution role).

Read set (exactly as authorized, no others):

- `docs/reports/NC-20260907-003-CLAUDE-REQUEST-R1.md`
- `docs/MODEL-ROUTING-POLICY.md`
- `docs/STUDENT-LIFECYCLE-STRATEGY.md`
- `docs/STUDENT-LIFECYCLE-DECISION-REGISTER.md`
- `docs/work-packets/NC-20260907-003-READONLY-CATALOG-RECONCILIATION.md`
- `.codex/config.toml`

No other file, Git history, `.program`, credentials, settings, runtime state, or
provider data was read. No source file was edited; this response is the only
artifact written.

Method: checked each of the 11 accepted facts in the request against the four
reviewed artifacts for contradiction or omission, then checked the artifacts
against review questions 2–10 (conflation, duplication risk, superseded
reservation/hold mechanics, stale-snapshot-as-current framing, phase-exit
evidence gaps, admission/projection ordering and installment scope, portfolio
mapping and silent authorization, first-packet writability/privacy/feasibility,
and routing/config concurrency/authority/`.program` boundaries).

## Findings

None of the 11 accepted facts are contradicted or omitted. Specifically
verified: the entitlement/enrollment/capacity/Company OS extension boundary and
no-parallel-master rule (`SLD-001`); typed/scoped/versioned provider bindings
with no ID/name/amount/date-implies-identity rule (`SLD-002`); one
agreement/order with many obligations/receipts, aliases/installments/retries
never duplicating orders/students/enrollments/seats (`SLD-003`); staged
ratchet with the 47/37/one figures explicitly labeled a dated snapshot, not
current provider totals; committed-seat simple sync preserved with
synchronous reservations/short-lived holds/live-checkout dependency explicitly
superseded (`SLD-005`); preservation of live bridge `138e43ab` and integration
of reviewed tip `8b1ffbb9` with migrations 146/147 explicitly unapplied and the
store explicitly disposable-only, both branches correctly stated to descend
from `f5adc8cc` with reconciliation "by meaning" (`SLD-006`); the recommended
first pilot stated as a new fully settled self-purchased supervision episode,
explicitly not yet authorized, with the Ma. Carmen episode explicitly excluded
from replay and accounting continuity preserved under registration holds;
later lifecycle gated on documented progress/assessment/completion evidence
with CoachGrader scoped to assessment only and all action gates preserved
(`SLD-007`); the revision-246 portfolio counts (one active claim, 17
candidates, three proposed priority-24 deltas making 20) and each delta's
status/authority/dependency/downstream description match the request's
accepted-fact text exactly, including the internal_reversible-vs-unauthorized
distinction between the two design deltas and the external_consequential,
authorization-required, gate-on-full-cutover status of projection
reconciliation; the one-writer/optional-read-only-child/no-recursive-delegation
/no-silent-Astra-fallback/one-`.program`-claim/resource-scoped-claims-remain-
proposed/explicit-model-and-effort-always-required/defaults-are-defense-in-
depth-and-fresh-task-behavior-unverified rules, and that `.program` ownership
stays with Astra while Sol only reads the binding and registers repository
work (`SLD-008`, work packet "Program" section); and canonical admission
completing with canonical state plus a disabled/pending projection request
without roster/access or end-to-end claims, with the strategy document
explicitly stating the ordering exists "to avoid making admission depend on
an item that itself depends on completed admission," the fully-settled-receipt
core explicitly excluding multiple distinct installment payments from the
pilot, and the eight-source-channel-disposition/review-only-correction detail
matching verbatim.

No conflation was found among program/offer/agreement/receipt/bundle/
component/access/class/progress — the strategy document's "one canonical
episode, several distinct records" table keeps these as separate rows with
separate primary authorities, and no provider ID/name/amount/date is used
anywhere as a sufficient condition for identity.

No mechanism permits installments, aliases, retries, or partial failure to
duplicate or lose funded promises, orders, participants, seats, accounting, or
exceptions; over-capacity funding is explicitly "recorded and held for owner
resolution without assigning above approved capacity."

No superseded reservation/hold/live-checkout mechanic is reintroduced;
`SLD-005` and the "What exists now" section both state the supersession and
non-return condition explicitly.

The undeployed enrollment branch and the 47/37 snapshot counts are
consistently and explicitly labeled historical/disposable/non-current, never
live.

No phase exit in the phased plan claims evidence it does not require: Phase 3
explicitly excludes replay/duplicate-suppression proof (deferred to Phase 4),
Phase 4 explicitly excludes roster/access/end-to-end proof (deferred to Phase
6), and each phase's stated exit evidence matches what that phase's work
actually produces.

Canonical admission (Phase 4) does not depend on downstream projection
(Phase 6); canonical-only evidence is never called end-to-end evidence; and no
artifact allows multiple distinct installment payments into the fully settled
pilot.

The portfolio mapping (one active claim, 17 candidates, three proposed deltas
with the stated internal_reversible/internal_reversible/external_consequential
authorities) is stated accurately, and no candidate is silently authorized —
the work packet's own header requires Astra to accept and allocate an
execution ID before dispatch, and the register text states the deltas "do not
authorize or replace any current item."

The first packet (read-only catalog reconciliation) is explicitly read-only
until a separately authorized dispatch adds write authority, is
privacy-minimized (opaque IDs/hashes/counts only, no raw provider payloads or
student rows), explicitly forbids Heartbeat browser automation and private
routes in favor of documented server APIs/read surfaces only, and specifies
concrete deliverables, acceptance checks, stop conditions, and a bounded
return report — it is executable and reviewable as written.

The routing policy and `.codex/config.toml` (Sol/high default, two-thread
ceiling) do not expand program concurrency, permissions, or release authority;
the policy explicitly states the child-thread ceiling "does not authorize
multiple program claims, releases, or writers," keeps `.program` mutation with
Astra (Sol explicitly does not edit `.program`), and requires reporting rather
than silently falling back to Astra on an unavailable/rejected model
selection.

## Verdict

`NO MATERIAL FINDINGS`
