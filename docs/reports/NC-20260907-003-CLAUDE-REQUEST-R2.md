# NC-20260907-003 projection-readiness correction review R2

This is a narrow load-bearing correction review after R1. Review only whether
the revised strategy and decision/portfolio register implement the accepted
projection-readiness sequence below without introducing a dependency cycle,
silently broadening authority, or weakening the earlier accepted boundaries.
Report material findings only and edit only the named response.

## Accepted correction

A new paid supervision enrollment must not be intentionally left without its
required provider delivery after canonical admission. Before any real event is
routed to the new writer:

1. selected projection execution, exact readback, retry, uncertain-acceptance,
   owned-failure, and rollback behavior must be implemented and independently
   reviewed through local/disposable proof;
2. exact canonical admission and selected provider projection activation must
   both be ready and explicitly authorized for one bounded rollout; otherwise
   the real event stays on the existing route;
3. canonical persistence and target apply/readback remain separate evidence
   milestones, with no claim that canonical-only proof is end to end;
4. the program items remain acyclic: the projection foundation precedes the
   production admission pilot; live projection reconciliation depends on the
   pilot and the foundation, then records activation/readback in the same bounded
   operational rollout before any unrelated financial-family expansion;
5. the fully settled first pilot covers one funding receipt and its several
   identifiers/aliases. Multiple distinct installment payments, refunds,
   sponsor/transfer/grant semantics, and service allowances remain in the later
   financial-agreement item and neither block nor broaden that pilot; and
6. Phase 6 continues reconciliation and legacy retirement after the first
   supervision path has been accepted end to end in Phase 4.

The requirement is ready delivery before diverting a paid event. It does not
prescribe a specific implementation mechanism beyond the existing host-owned,
versioned outbox/readback and authority boundaries.

## Exact proposed portfolio mapping

No `.program` mutation has occurred. Astra's proposed revision 247 is the
authority for this review:

- New `work:student-enrollment-projection-foundation`: title "Prepare enrollment
  provider delivery before a paid-event pilot"; priority 24; candidate;
  `internal_reversible`; authorization not required; depends on
  `work:student-product-catalog-source-reconciliation`,
  `work:student-enrollment-transactional-store`, and
  `work:student-enrollment-authenticated-source-admission`. Completion is reviewed
  local implementation plus positive/negative/disposable destination identity,
  exact readback, retry, uncertain acceptance, duplicate suppression, and rollback
  proof, with pinned code and no live provider/student write.
- Existing `work:student-enrollment-production-admission-pilot` gains projection
  foundation as a dependency. It remains `external_consequential`, unauthorized,
  and its canonical completion does not claim provider projection completion.
  Its next action requires projection authority/readiness before diverting a paid
  event and names canonical versus delivery evidence within the same rollout.
- New `work:student-enrollment-projection-reconciliation` remains priority 24,
  candidate, `external_consequential`, unauthorized; depends on both production
  admission pilot and projection foundation. It owns live projection activation,
  exact readback, retry/uncertain-acceptance reconciliation, natural outcome, and
  rollback evidence in the same bounded rollout.
- `work:academy-capacity-authority-cutover` continues to depend on projection
  reconciliation. Existing simple-sync, capacity, control-plane, action, and
  minion items remain unchanged.
- The three earlier proposed candidates plus projection foundation raise the
  observed candidate count from 17 to 21. Count is only a review signal.

## R1 disposition

R1 returned no material findings on the prior accepted packet. After that review,
Astra supplied the correction above. R1 also said Phase 3 excluded replay proof,
but the actual table required serializable/disposable replay before the natural
pilot. Treat that sentence as reviewer overstatement; preserve the plan's replay
proof and do not edit the historical R1 response.

## Allowed read paths

- This request.
- `docs/STUDENT-LIFECYCLE-STRATEGY.md`
- `docs/STUDENT-LIFECYCLE-DECISION-REGISTER.md`
- `docs/reports/NC-20260907-003-CLAUDE-RESPONSE-R1.md`

Do not read other repository files, Git history, `.program`, `/tmp`, credentials,
settings, runtime state, or provider data. Do not reopen model routing, source
catalog design, simple-sync, typed identity, progress/action, or first-packet
choices except where the correction contradicts them.

## Review questions

1. Is projection implementation/readback ready before a real event can enter the
   new writer, with an explicit do-not-divert fallback?
2. Are canonical admission and full delivery distinct evidence milestones inside
   one authorized bounded rollout, without an operational wait through Phase 5/6?
3. Is the item graph and Phase 3→4→5→6 order acyclic and consistent with the exact
   mapping above?
4. Does full end-to-end supervision acceptance occur before unrelated installment
   or funding-family activation?
5. Does local projection preparation remain non-production and non-provider, and
   do live provider action/readback and full cutover remain separately authorized?
6. Does the plan preserve one-receipt/many-alias proof in the first pilot and
   multiple-distinct-receipt semantics later?
7. Is R1's replay overstatement explicitly and truthfully disposed without
   weakening Phase 3 replay evidence?

For each material finding, give severity, exact file/section, accepted correction
violated, consequence, and smallest fix. Ignore prose preferences and speculative
backlog. If none, write `NO MATERIAL FINDINGS`.

## Response

Write only
`docs/reports/NC-20260907-003-CLAUDE-RESPONSE-R2.md`, with a compact scope receipt,
findings, and verdict.
