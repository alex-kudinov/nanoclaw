# Relationship Owner Authority

Task: `NC-20260826-001`

Program item: `work:relationship-owner-authority`

Decision:
`.program/decisions/decision-relationship-owner-tandem-team-2026-08-26.json`

Status: live-verified on exact release `416384fc7131`; migration 138 and the
generic assignments are active, while follow-up persistence, drafting,
sending, provider writes, and every action authority remain disabled/ungranted.

## Decision

Tandem OS owns the relationship-owner registry. The current explicit generic
organizational principal is:

| Field | Value |
| --- | --- |
| principal key | `team:tandem` |
| display name | `Tandem Team` |
| principal type | `organizational_team` |
| managing system | `tandem_os` |
| action authority | `none` |

The principal is explicitly assigned to each governed follow-up lane:
`sales_conversation`, `proposal_signature`, and `receivable`. These are
three tracked assignments, not an inferred fallback from a sender, record
creator, pipeline entry, or recent activity.

## Meaning and boundary

Relationship ownership means organizational accountability and routing. It
does not determine a sender, approve customer copy, grant a minion capability,
activate follow-up, authorize a provider write, or confer payment, contract,
credential, or customer-communication authority. Those boundaries remain
separate exact-action decisions.

The Sales execution group and Contador truth owner remain workflow roles:

- Sales coordinates Sales/proposal work.
- Contador owns invoice and payment truth plus initial collection review.
- Tandem Team is the generic accountable relationship owner.
- Mailman may send only exact separately approved bytes through the existing
  host action boundary.

## Schema contract

Migration 138 adds two admin-only append-only relations:

- `relationship_owner_principals`: stable Tandem OS principal identity,
  display label, managing system, decision provenance, and a constrained
  `action_authority='none'`;
- `relationship_owner_assignments`: exact scope, principal, decision,
  effective time, optional superseded assignment, and a deterministic
  fingerprint.

The current three assignments become effective at the accepted decision time.
A future change appends a later decision-bound assignment for the same exact
scope and names the superseded row. It does not rewrite history.
Future admin tooling that batches multiple scope changes must acquire/insert
them in stable lane order; the schema serializes each exact scope, and stable
ordering avoids a harmless but retryable cross-scope deadlock abort.

`company_followup_cases` stores the exact principal key, assignment ID, and
decision reference. A composite foreign key also binds the assignment scope to
the case lane, so an assignment for one lane cannot be reused for another.

## Resolution

The host resolves the most recent effective assignment for the exact lane and
observation time. It accepts only:

- a valid principal key and positive assignment ID;
- a tracked decision reference;
- `managing_system='tandem_os'`;
- `action_authority='none'`.

Missing, duplicated, malformed, or unavailable evidence yields no owner and
blocks actionable work. There is no fallback to `createdBy`, a global sender,
an execution group, pipeline duplication, or agent memory. Authoritative
terminal source state may still close a case without ownership because it
requires no new action.

## Rollout and rollback

The initial release is host/admin only. It changes no provider, customer,
message, approval, schedule, prompt, capability grant, or follow-up activation.
Verification must prove:

- one principal and three exact assignment rows;
- fail-closed missing/malformed assignment behavior;
- assignment-to-lane foreign-key integrity;
- append-only principal/assignment evidence;
- durable case provenance;
- zero non-admin grants;
- unchanged provider/action boundaries.

Rollback 138 refuses once any follow-up case references an assignment or the
registry differs from the exact seed. Otherwise it removes only this additive
authority slice.
