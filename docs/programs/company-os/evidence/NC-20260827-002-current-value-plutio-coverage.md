# NC-20260827-002 — current-value Plutio identity coverage closure

Date: 2026-08-27

Program item: `work:relationship-context-plutio-client-ref-coverage`

Decision:
`.program/decisions/decision-relationship-context-current-value-plutio-coverage-2026-08-27.json`

## Owner boundary

Complete only the useful current-client identity pass and then return to
higher-value Company OS roadmap work. Historical Plutio project/client
assignment or reassignment is explicitly low value and excluded.

The pass may use only already-existing source-authoritative exact identifiers.
It may not use name/email similarity, contact presence, project titles, or
provider cleanup as identity authority.

## Current-only provider audit

The existing stable provider snapshot contains 11 qualifying In-progress
coaching projects. Their client links contain nine distinct person objects and
three company-link occurrences across two distinct company objects.

Two content-identical read-only provider lookups proved:

| Current object class | Expected | Returned | Stable |
| --- | ---: | ---: | --- |
| Person objects | 9 | 9 | yes |
| Distinct company objects | 2 | 2 | yes |

The nine person objects contain no populated custom field and no populated
external-ID value. The two company objects contain two custom-field entries in
total, both without values, and expose no provider-reference field. No raw
name, email, custom value, project title, or provider payload is retained in
this evidence.

## Exact host-authority comparison

The Party graph had 1,372 active verified exact Plutio person references at
the audit time. Two identical aggregate PostgreSQL reads over only the current
project client IDs returned:

| Exact-authority result | Count |
| --- | ---: |
| Current person objects | 9 |
| Current person IDs in authoritative `plutio_refs` ledger | 1 |
| Exact active current person refs | 1 |
| Current person conflicts | 0 |
| Distinct current company objects | 2 |
| Current company IDs in authoritative ledger | 0 |
| Exact active current company refs | 0 |
| Current company conflicts | 0 |

The one current person already present in the authoritative ledger is the same
single active engagement mapped by NC-009. The remaining eight people and two
companies have no zero-touch exact bridge. Creating one would require a new
provider-side/internal-link assignment or non-authoritative name/email
inference, both outside the accepted boundary.

## Disposition

No identity, code, database, provider, configuration, or runtime mutation is
justified. No Claude implementation review, build, release, deployment, or
rollback is required because there is no implementation delta.

The existing exact release
`6a9783281a749b0fd8bd244dabebcbbc0d9a5fcb` remains live and healthy:

- Plutio snapshot: 117 projects, 183 contracts, eight field definitions, 59
  qualifying coaching projects, one active and one historical exact mapping;
- adapter replay: zero new observations, two duplicates, zero changed
  projections;
- client projection: 1,444/1,444 active Parties, 63 defensible customer/client
  Parties, one active coaching, one historical coaching, zero stale-current,
  and zero changed projections;
- query disabled with zero grants; Gmail/Slack connected; active/waiting and
  outgoing queues empty.

A later final health refresh observed one unrelated natural Slack conversation
active. It was not a task container and had zero pending task, waiting-group,
or outgoing-queue work. NC-20260827-002 created no container, queue item,
approval, message, or outbound action.

No historical project/client assignment or reassignment occurred. No Plutio,
provider, Party, role, source-ref, payment, consent, communication, minion,
checkout, lifecycle, Circle, Sales-support, external-watchdog, or legacy-
receiver state changed.

The unresolved current eight-person/two-company gap and the older historical
holds remain explicit unknowns. This is the accepted useful coverage ceiling,
not unfinished cleanup work.

## Program reconciliation and roadmap return

Company OS revision 138 marks
`work:relationship-context-plutio-client-ref-coverage` done with all eight
continuity commitments individually completed. No Plutio identity-coverage
candidate remains active, ready, or waiting. The portfolio has no active or
eligible item.

The nominal priority-7 product-identity and priority-8 payer/student-identity
candidates remain dependency-blocked by the authorized payment-fulfillment
case ledger, which is waiting for a natural typed Stripe payment/refund and may
not be manufactured. The first dependency-complete roadmap candidate by
priority is `work:bizmgr-payables-visibility-queue` (priority 9): make every
captured vendor invoice visible as owned due/missing-information/QuickBooks-
entry/payment/reconciliation work while preserving manual accounting apply.
It remains a separately unselected and unauthorized queue/schema decision.
