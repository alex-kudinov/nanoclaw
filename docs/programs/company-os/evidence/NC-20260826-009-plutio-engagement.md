# NC-20260826-009 — exact Plutio coaching-engagement context

Date: 2026-08-27

Program item: `work:relationship-context-plutio-engagement-enrichment`

## Accepted outcome

The live provider-neutral Party Context now imports authoritative Plutio
coaching-project status only for exact existing Plutio person refs. One fresh
In-progress project proves one active coaching engagement and one Completed
project proves one historical engagement. Fifty additional person links and
eight company links remain held because no exact Party ref exists; no
name/email/contact/title fallback ran.

The client projection keeps active coaching, historical coaching, paid-
customer history, active subscription, unproven client/student/prospect labels,
stale evidence, and unknowns distinct. Query/minion access remains disabled.

No Plutio/provider/customer/project/contract/invoice/proposal/task/note/activity
write, credential value/scope/rotation, Party merge, role/source-ref mutation,
payment/consent action, communication, checkout/lifecycle/Circle/Sales-support,
or legacy-receiver change occurred.

## Continuity correction

The initial task reservation used `NC-20260826-008`. During the exact-live
merge, that ID was found already live for the concurrent Sales operator-answer
fast path. Per `docs/CHANGE-PROTOCOL.md`, the later unpublished Plutio task was
renumbered to `NC-20260826-009`. Current active work, changelog, review files,
authority docs, program claim, and this evidence use NC-009. Pre-renumber local
backup directories retain NC-008 in their historical path and are labeled as
such rather than moved.

## Shared toolbox repair

The shared Plutio helper previously sourced the entire project `.env` as shell.
An unquoted display address failed parsing and an unrelated password ampersand
executed as shell syntax before Plutio access. The repair:

- is committed locally in the no-remote toolbox repository as
  `922b7feab7a99022410a1971891bfe795e2db231`;
- imports only `PLUTIO_ENV_FILE`, `PLUTIO_API_CLIENTID`,
  `PLUTIO_API_CLIENTSECRET`, and `PLUTIO_SUBDOMAIN` as literal values;
- evaluates no unrelated line and gives already-exported process values
  precedence;
- requires an explicit pointer to be absolute and readable;
- uses NanoClaw's non-secret path pointer to the existing Bizmgr-owned
  credential file; no credential was copied or changed;
- preserves byte-identical underlying values for the two local syntax-only
  quote repairs.

Exact reviewed helper SHA-256 on Studio and Mini:
`124aa341f4a37776aa4308f66d9011b26a6b33b5f2c3afabef924ad7d1873c8b`.
Literal/no-evaluation/fallback/precedence tests, shared registry validation,
and representative read-only project calls pass on both hosts.

Recovery backups:

- pre-syntax/config/tool repair:
  `~/.local/share/nanoclaw-config-backups/NC-20260826-008-20260827T040200Z`;
- pre-operational-tool/path install:
  `~/.local/share/nanoclaw-config-backups/NC-20260826-008-20260827T040500Z`.

These paths predate the task-ID collision correction.

## Aggregate Plutio discovery

Two identical complete read-only snapshots were required before acceptance:

| Provider object/evidence | Count |
| --- | ---: |
| Projects | 117 |
| Contracts | 183 |
| Signed contracts | 131 |
| Signed contracts without a returned project | 22 |
| Exact coaching-field definitions | 8 |
| Projects with a nonempty accepted coaching field | 59 |
| In progress / Completed / New / Canceled coaching projects | 11 / 41 / 2 / 5 |
| Person / company project-client links | 52 / 8 |

The 11 In-progress projects cover 11 distinct provider clients through nine
person links and three company links with one overlap. Signed contracts only
corroborate a linked project; signature/signee content is discarded and never
identifies the participant.

## Implementation and review

- NanoClaw implementation:
  `2e55df75072d76da49d657c69436632bb4ea2c75`;
- exact-live semantic merge:
  `0b687f7e49cb3d34ebfc2bb9e871e3135ac4307f`;
- exact release:
  `6a9783281a749b0fd8bd244dabebcbbc0d9a5fcb`;
- adapter: `plutio_engagement_snapshot@1.0.0` under logical source scope
  `primary-engagement`;
- fact: `relationship.plutio.coaching_project@1`;
- exact identity lookup remains `(plutio, primary, person)`; the adapter creates
  no identity ref and passes resolved canonical Party IDs to core ingestion;
- project type requires a nonempty value under one of eight exact provider
  custom-field definitions; raw values are discarded;
- In progress is freshness-bounded current, Completed historical, New planned,
  and Canceled non-authorizing;
- content-only watermarks make byte-identical later polls duplicate-only;
  transactionally refreshed adapter-registration health is the 26-hour current-
  snapshot freshness authority;
- each provider run double-reads the complete minimized snapshot and refuses
  any content drift, duplicate, cap, malformed row, or incomplete field catalog.

Claude Sonnet/high R1 found a Medium run-time watermark churn defect, a Low
offset-pagination omission risk, and unverified host wiring. The final
correction combines content-only watermarks with adapter-health freshness,
adds the double-read stability barrier, and exposes direct wiring coverage.
R2 returned `NO MATERIAL FINDINGS`.

R1 disclosed reading two unlisted core files solely to confirm watermark
mechanics. No write, Bash, MCP, provider, credential, or secret action occurred.
Across both rounds: 18 model calls, 195,806 cache-creation tokens, 1,070,164
cache-read tokens, 41,647 output tokens, and 129,160 maximum context. The
maximum exceeded the 100k target and is orchestration debt, not extra
confidence.

## Verification

- focused Plutio/Relationship Context/Sales combined lineage: 69/69 pass;
- disposable PostgreSQL: 6/6, including exact person refs, company/missing
  holds, current/historical/planned/canceled, freshness expiry, registration,
  different-poll-time duplicate replay, aggregate projection, merge/scale
  continuity, and prohibited-value refusal;
- format, typecheck, build, documentation continuity, capability matrix, diff,
  secret/private-value scans: pass;
- full combined root: 3,333 pass / 31 skip; sole failure is the unchanged CNPC
  wrapper-literal assertion;
- independent runner: build and 45/45 pass;
- release gate: 30 files / 748 tests plus runner 45/45 pass.

## Immutable release and recovery

- source tree: `859302c781d0e2904b877db084cdc08afcc186a2`;
- artifact SHA-256:
  `216e5191a1597c008b465073068dfd519bd4b2acbacda481de02c72b08a9d55b`;
- artifact files: 1,008;
- archive SHA-256:
  `6900a21fa5d289813a405d5da03cf07b2eb9bacf726da48952a485a959b5a6f3`;
- exact Node 22.23.2 locally and live;
- fresh local and Mini extraction/runtime verification: pass;
- mode-0700 deployment backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260826-009-20260827T045800Z`
  with custom PostgreSQL, WAL-safe SQLite, plist, health, toolbox helper, and
  inherited Sales prompt copies;
- retained rollback plist:
  `~/Library/LaunchAgents/com.nanoclaw.plist.rollback-f52f708f5125-2026-08-27T04-59-05-327Z`.

Off-first activation changed exactly the executable, code root, and expected
commit. Exact release, prompt bytes, channels, queues, sources, existing client
projection, lifecycle, checkout, query, and toolbox read passed before a
semantic one-key plist comparison enabled only
`RELATIONSHIP_CONTEXT_PLUTIO_ENGAGEMENT_ENABLED=1` and reloaded once.

## Live outcome

The stable live provider snapshot is 117 projects / 183 contracts / eight
definitions with the same 59 coaching-project split as discovery.

Identity-bound result:

| Result | Count |
| --- | ---: |
| Exact person project links | 2 |
| Distinct exact Parties | 2 |
| Fresh current coaching engagements | 1 |
| Historical coaching engagements | 1 |
| Missing exact person refs held | 50 |
| Unsupported company links held | 8 |
| Unsupported/malformed other links | 0 |

Durable state and replay:

- two observations and two per-project projections, each version 1;
- normalized fact payloads have zero prohibited keys/values and zero email-like
  values; the standard projection wrapper retains the opaque source record ID
  as source provenance, not normalized fact value;
- content-identical later provider read: zero new observations, two duplicates,
  zero changed per-project projections;
- client projection covers 1,438/1,438 active Parties: 63 defensible customer/
  client Parties, 62 paid-history, five active subscriptions, one fresh active
  coaching, one historical coaching, nine unproven client labels, 95 summary-
  unknown, and zero stale-current evidence;
- the historical coaching Party overlaps paid history, so it does not increase
  the 63-Party union;
- adding the NC-009 schema fields advanced all fixed client projections once
  during off-first deployment; the two mapped Parties advanced again when
  engagement facts arrived. Final 1,438-row version sum is 2,878, max version
  3, fingerprint `fa1fd7ffb6fe7c43d946a7ae41bfdc75`;
- exact client-projection replay returned `projectionsChanged=0`.

## Non-interference

- exact release verified under one listener; inherited Sales prompt bytes match
  the live release;
- Gmail/Slack connected, zero outgoing/pending-send backlog at activation;
- query remains off with zero active grants;
- existing Trafft/source/client/lifecycle/checkout workers remain enabled and
  healthy; lifecycle remains 41 events / zero active enrollments / 23 open
  exceptions with consumers/Circle off;
- checkout production mode and prior cutoff remain unchanged;
- Plutio person refs naturally grew from 1,365 to 1,366 before NC-009 and were
  not changed by this adapter;
- active Party/role/source-ref facts are unchanged by NC-009;
- error-log baseline remains 273.

A natural unrelated container became active after verification; NC-009 created
no queue item, message, approval, or outbound action.

## Rollback

Disable `RELATIONSHIP_CONTEXT_PLUTIO_ENGAGEMENT_ENABLED` and reload before
restoring `f52f708f`. Restore the backed-up Plutio auth helper if toolbox
rollback is required. Preserve migration-137 observations/projections; ordinary
rollback must not delete them. Plutio needs no rollback because no provider
write occurred.

## Program reconciliation

Pending final Company OS commitment reconciliation and registration of the
remaining exact Plutio person/company identity-coverage gap as a candidate.
