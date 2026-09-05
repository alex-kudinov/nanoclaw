# NC-20260905-004 — Academy capacity architecture adoption

Date: 2026-09-05

Program: `program:company-os` charter 1.0.0

Decision: `.program/decisions/decision-academy-capacity-architecture-2026-09-05.json`

## Owner instruction

The owner accepted the reviewed class-capacity architecture after explicitly
correcting the operational scope: MCS Thursday on 2026-09-24 remains available.
The September sold-out override covers the September 7 ACC shared class and
September 25 MCS Friday, not MCS Thursday.

## Reconciliation performed

The Tandemweb proposal at commit `2bc59b670` was compared with the clean
NanoClaw enrollment-foundation lineage at `1d77ae5a`, which already contains
the entitlement catalog at `ba4437be` and the enrollment foundation at
`ca544654`.

The proposal's semantic decisions are retained, but its conceptual
`academy_enrollments`, funding, entitlement, and assignment table names are not
a second schema authority. Capacity extends the existing enrollment order,
enrollment seat, student enrollment, component entitlement, class assignment,
financial agreement/obligation, projection receipt, and exception contracts.

The active concurrent Company OS item
`work:student-enrollment-dark-foundation` was discovered before portfolio
mutation. This task did not interrupt or overlap its files. The capacity schema
work is represented as the dependent candidate
`work:academy-capacity-extension`, not as a second dark enrollment foundation.

## Accepted architecture

- Company OS/NanoClaw is the sole governance and database home.
- One v1 seat pool belongs to exactly one delivery block; many offers may share
  it.
- Occupancy comes from current capacity-bearing class assignments.
- Enrollment seats, orders, payments, roster rows, and provider memberships do
  not substitute for occupancy.
- Checkout and reason/actor/source/TTL-bound manual reservations share one
  transaction boundary.
- Refund and withdrawal are separate; transfer is atomic across pools.
- FIFO waitlist selection is canonical, but outreach remains human-approved.
- Tandemweb is a signed, expiring projection and reservation client.
- The narrow Capacity minion invokes typed host commands and owns no canonical
  state, provider credentials, or message authority.

## Company OS portfolio receipt

The first stale compare-and-swap against revision 173 was rejected after a
concurrent task advanced the portfolio. No state was overwritten. The task
reoriented at revision 176, preserved the active enrollment implementation,
and applied revision 177 with six separately gated candidates:

1. `work:academy-capacity-extension`
2. `work:academy-capacity-readonly-reconciliation`
3. `work:bookkeeper-capacity-enrollment-contract`
4. `work:academy-capacity-minion-operator-workflow`
5. `work:tandemweb-capacity-reservation-cutover`
6. `work:academy-capacity-authority-cutover`

All six remain `candidate` and explicitly unauthorized. The existing active
item remains `work:student-enrollment-dark-foundation`.

## Review and verification boundary

The source proposal had two bounded Claude Sonnet/high architecture rounds.
R1's authority, schema, pooling, reservation, Bookkeeper, lifecycle, stage,
and rollback findings were incorporated. R2 confirmed all material findings
closed after one glossary correction enforcing exactly one delivery block per
pool in v1.

This adoption adds no new implementation review claim. It reconciles the
accepted semantics with the already reviewed NanoClaw predecessors. No third
Claude round was started.

No migration was authored or applied. No source/runtime logic, production
service, provider, Student Roster, student record, waitlist entry, customer
message, cohort availability, or deployed artifact changed.

## Next gate

The owner must separately authorize `work:academy-capacity-extension` after the
active enrollment dark foundation completes and the remaining enrollment
policy questions required before build are resolved. No later gate is implied
by this adoption.
