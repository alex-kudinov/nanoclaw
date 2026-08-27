# Plutio coaching-engagement Relationship Context

Task: `NC-20260826-009`

Program item: `work:relationship-context-plutio-engagement-enrichment`

Decision:
`.program/decisions/decision-relationship-context-plutio-engagement-enrichment-2026-08-26.json`

Status: exact release `6a9783281a749b0fd8bd244dabebcbbc0d9a5fcb` is
deployed, enabled, privacy-checked, replayed, and live-verified with no
unresolved material review finding.

## Objective and authority boundary

Add native Plutio project status as evidence for current and historical
coaching engagement without treating a Plutio contact, recorded Party role,
payment, project title, or document as an active-client declaration.

Plutio is authoritative only for exact project, contract, client-link, custom-
field definition, status, and provider timestamps. Company OS decides whether
those native fields satisfy the accepted coaching-engagement evidence tier and
maps only through an already-active exact Plutio person reference.

The adapter may write only host-owned adapter registration, normalized
observations, deterministic projections, and aggregate health. It may not
create/update/delete a Plutio person, company, project, contract, invoice,
proposal, task, note, activity, custom field, or other provider record. It may
not create/merge a Party, bind a new identity, rewrite roles/source refs,
change credentials, send a message, or grant a minion capability.

## Live aggregate discovery

Read-only MCP pagination on 2026-08-26 found:

| Provider object | Complete aggregate |
| --- | ---: |
| Projects | 117: 11 New, 15 In progress, 65 Completed, 26 Canceled |
| Contracts | 183: 131 signed, 34 pending, 16 cancelled, 2 draft |
| Project custom-field definitions | 8 exact coaching definitions |

Seventy-two projects carry at least one recognized coaching field; 59 have at
least one nonempty value. The 59 split into 11 In progress, 41 Completed, five
Canceled, and two New projects. Their exact project client links contain 52
person links and eight company links. The current 11 In-progress projects cover
11 distinct Plutio clients through nine person links and three company links
with one controlled overlap.

Company client links cannot map yet: the Party graph has seven organizations
but zero exact Plutio company refs. They remain unsupported, not name-matched.
The live graph has 1,365 active Plutio person refs; person project links may map
only through those exact refs.

Signed contracts corroborate project identity only. Of 131 signed contracts,
109 point to a currently returned project and 22 do not. A signature or signee
does not identify the coaching participant, so contract content/signatures are
discarded and never independently declare engagement.

## Coaching evidence tier

The provider custom-field catalog must contain exactly one definition for each
accepted title:

- Number of Sessions;
- Coach;
- Session Duration;
- Number of Sessions (Group);
- Mentor Coach;
- Individual Mentor Hours;
- Group Mentor Hours;
- ICF Credential.

The runtime resolves their provider IDs transiently from definitions. It does
not hardcode IDs. Duplicate/missing definitions fail the whole adapter. A
project qualifies as coaching only when at least one accepted field has a
nonempty value. The value itself is discarded; only a controlled field code is
retained.

For every qualifying project-client link:

1. the client entry must have a bounded opaque ID and exact entity type;
2. `person` must resolve through active
   `(plutio, primary, person, external_id)` Party Context identity;
3. `company` remains an aggregate unsupported hold until an exact company ref
   exists under a separately accepted identity source;
4. any missing exact person ref remains held; no email/name fallback runs.

Normalized engagement state is deterministic:

| Plutio status | Engagement meaning |
| --- | --- |
| In progress | current coaching engagement while the snapshot is fresh |
| Completed | historical coaching engagement |
| New | planned only; not a client claim |
| Canceled/Cancelled | canceled only; not historical completion |
| anything else | unknown |

The fact value contains only controlled project status, engagement state,
coaching field codes, signed-contract corroboration boolean, and exact-person-
ref linkage code. Project/client/contract IDs remain source-envelope fields,
not projection values. Names, descriptions, custom values, signatures,
amounts, contact details, files, tasks, notes, and raw payloads are discarded.

## Client relationship projection

`relationship.client_status.v1` adds:

- `active_coaching_client` as highest summary precedence;
- `historical_coaching_client` after paid-customer evidence;
- current/historical/stale project counts and controlled evidence tiers;
- `active_engagement_status=current` only while at least one latest project
  observation is current and within its 26-hour freshness window.

Historical completion does not prove a current engagement. An expired latest
In-progress observation becomes explicit stale evidence and no longer produces
an active-client claim. Paid-customer history, subscriptions, unproven role
labels, and unknown engagement remain separately visible.

## Runtime and health

The adapter is separately default-off:

```text
RELATIONSHIP_CONTEXT_PLUTIO_ENGAGEMENT_ENABLED=0
```

When enabled, startup fires one non-blocking run and an unref'ed 15-minute
timer with an in-process overlap guard. Each run fetches the complete bounded
snapshot twice before opening the database transaction and requires identical
content-derived hashes. This stability barrier detects offset-page omission or
overlap during concurrent provider mutation. Project/contract IDs must be
unique across pages; drift, caps, malformed rows, incomplete custom-field
authority, timeout, or provider failure degrade only this adapter.

Fact projection watermarks are content-derived and exclude poll time, so a
byte-equivalent later poll is duplicate-only. Current-snapshot freshness comes
from the transactionally updated adapter registration `last_health_at`, not by
mutating immutable observations or forcing a semantic version on every poll.
If successful registration health ages beyond 26 hours, latest In-progress
facts become stale and non-authorizing until a complete stable refresh.

`/health.relationshipContext.plutioEngagement` exposes aggregate object counts,
coaching/status counts, exact/missing/unsupported links, distinct Parties,
observation/projection changes, timestamps, completion, and bounded error
codes. It fixes `consumerEnabled=false` and returns no identities or values.

The first live snapshot mapped two of 52 person links through existing exact
refs: one fresh active engagement and one historical engagement. Fifty person
links and all eight company links remain held. The all-Party projection is
1,438/1,438 with 63 defensible customer/client Parties; exact provider and
client-projection replays changed zero semantic projections.

## Current-value identity coverage closure

NC-20260827-002 applies the owner's proportionality boundary: finish only
useful current/returning-client coverage and do not assign or reassign
historical Plutio projects or clients.

A stable current-only audit found nine person objects and three company-link
occurrences across two distinct companies on the 11 qualifying In-progress
projects. All objects still exist in Plutio. Exactly one current person is
already present in both the authoritative `plutio_refs` ledger and the active
exact Party ref graph; it is the existing active engagement above. The other
eight people and two companies have no host ledger bridge, populated provider
external-ID/custom-field value, or conflict.

No additional zero-touch mapping is therefore defensible. Creating one would
require provider-side relinking/cleanup or name/email inference. Both are
outside the accepted boundary, so current and historical holds remain explicit
unknowns and the Plutio mapping lane is closed. This closure made no code,
database, provider, Party, role/ref, configuration, or runtime change and
requires no release or rollback. At closure, exact live `6a978328` remains
healthy; the client projection covers 1,444/1,444 active Parties and both
provider/client replays change zero projections.

## Shared toolbox dependency

Discovery exposed that `shared/plutio/lib/auth.sh` sourced the entire project
`.env` as shell. Unrelated literal display-address and password metacharacters
either failed parsing or executed as shell syntax. Local toolbox commit
`922b7feab7a99022410a1971891bfe795e2db231` replaces this with literal parsing
of only `PLUTIO_ENV_FILE`, `PLUTIO_API_CLIENTID`,
`PLUTIO_API_CLIENTSECRET`, and `PLUTIO_SUBDOMAIN`; unrelated lines are never
evaluated. Process-provided values remain highest precedence. NanoClaw points
by non-secret absolute path to the existing Bizmgr-owned credential file; no
credential is copied or changed.

The toolbox repository has no configured Git remote, so the commit is local.
Deployment must back up and copy the exact reviewed auth helper to the Mini,
verify its hash/tests and one read-only provider call, and preserve rollback.

## Verification and release gates

- safe dotenv literal/no-evaluation/fallback/precedence tests plus shared
  Plutio registry validation and representative MCP read;
- status/custom-field/client parsing, pagination/duplicate/page-cap/malformed/
  source-failure/default-off/health/privacy tests;
- disposable PostgreSQL proof for exact refs, person/company/missing holds,
  current/historical/planned/canceled semantics, freshness expiry, registration,
  duplicate-only replay, merge lineage, scale, and PII-negative readback;
- focused Relationship Context/Plutio/setup tests, format, typecheck, build,
  continuity/capability, full root, and independent runner;
- independent Claude Sonnet/high review across the NanoClaw implementation and
  toolbox repair with every verified material finding corrected;
- exact current-lineage immutable release and archive verification locally and
  on the Mini under pinned Node;
- zero-work drain, PostgreSQL/SQLite/plist/toolbox/config backup, off-first
  activation, exact release/channel/queue/source/client-projection proof;
- exact toolbox helper installation/read canary, then one-key adapter enable,
  bounded reload, aggregate facts/projections/privacy readback, and exact replay.

No synthetic Party, project, contract, provider record, message, payment, or
business action is created for proof.

## Rollback

Disable `RELATIONSHIP_CONTEXT_PLUTIO_ENGAGEMENT_ENABLED` and reload before
restoring the prior host release. Restore the backed-up Mini Plutio auth helper
if toolbox rollback is required. Preserve migration-137 observations and
projections; ordinary rollback must not delete versioned evidence. Plutio
requires no rollback because this adapter never writes it.
