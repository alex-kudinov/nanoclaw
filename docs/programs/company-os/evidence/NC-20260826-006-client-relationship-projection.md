# NC-20260826-006 — defensible client and customer relationship projection

Date: 2026-08-27

Program item: `work:relationship-context-client-relationship-projection`

## Accepted outcome

The live provider-neutral Party Context now maintains one deterministic,
privacy-minimized relationship-status projection for every active canonical
Party. Only exact succeeded Stripe PaymentIntent history or a latest exact
active Stripe subscription produces positive customer evidence. Existing
client, student, and prospect role rows remain separately visible but
non-authoritative because their live rows carry no source or accepted-decision
receipt. Active coaching engagement remains explicitly unknown.

No Party merge, role/source-reference rewrite, legacy promotion, provider or
customer mutation, communication, consent/payment/refund/contract action,
query/minion activation, checkout/lifecycle/Circle change, or legacy-receiver
change occurred.

## Aggregate discovery and correction

- Active canonical graph: 1,430 people and seven organizations.
- Identity coverage before this slice: 1,418/1,430 people have at least one
  stable source reference and 1,362 span two or more providers.
- Exact current Stripe facts prove 62 distinct paid-customer Parties; five also
  have a latest active subscription.
- Nine active client, two student, and 1,317 prospect role rows all have empty
  metadata and no source/decision receipt. The initial 69-Party estimate that
  combined paid evidence with client labels was corrected to 62 defensible
  positive customer identities. The nine client labels are retained as
  recorded/unproven evidence.
- Plutio contract/project/invoice discovery failed before provider access
  because the shared toolbox environment file is not parseable. No credential
  or environment value was inspected or changed, and no active engagement was
  inferred.

## Implementation and independent review

- Implementation commit:
  `0ca7939fbb50e7e236969846d6b7987bc4fb3c73`.
- Exact pushed release commit:
  `f8595966ffa145dee19051ed792b9ff616456e5e`.
- Fixed projection key: `relationship.client_status.v1`.
- One transaction keyset-pages all active person/organization Parties under a
  PostgreSQL transaction advisory lock; the host also refuses process-local
  overlap and schedules non-blocking unref'ed ticks.
- Latest state is selected per exact Stripe source scope and record ID. One
  Party's role/Stripe watermarks prevent unrelated global version churn.
- Summary precedence is paid customer, recorded client, recorded student,
  recorded prospect, then unknown. Controlled booleans/counts retain overlaps.
- Every version-1 projection is `partial` with
  `active_engagement_status=unknown`; recorded client labels also carry
  `client_role_provenance_unavailable`.
- Health is aggregate-only and fixes `consumerEnabled=false`; the global query
  remains disabled with zero active grants.
- Claude Sonnet/high R1 reported one High merge-lineage concern. Codex inspected
  the migration sources excluded from that review: the core merge moves role
  rows and migration 137 moves current observation identity to the canonical
  winner. A new exact loser/winner integration regression proves the evidence
  remains on the winner and no loser projection is created. The finding was
  not reproduced; no implementation correction or second review round was
  warranted, and no material finding remains.
- Claude usage: one session, nine model calls, 116,135 cache-creation tokens,
  550,498 cache-read tokens, 29,603 output tokens, and 116,137 maximum context.
  The maximum exceeded the 100k target and is orchestration debt, not extra
  confidence.

## Verification

- focused relationship/setup/wiring: 34/34 pass;
- disposable PostgreSQL: 5/5, including 1,400+ Party pagination, person/org
  coverage, recorded-role downgrade, latest subscription transition,
  role addition/removal, merge lineage, one-Party-only advancement, zero-churn
  replay, full coverage, and PII-negative readback;
- format, typecheck, build, documentation continuity, capability matrix, diff,
  and secret/private-value scans: pass;
- full root: 3,317 pass / 30 skip; the sole failure is the unchanged CNPC
  wrapper-literal assertion reproduced from the NC-005 lineage;
- independent agent runner: build and 45/45 pass;
- release gate: 30 files / 742 tests pass plus runner 45/45.

## Immutable release and recovery

- exact release commit:
  `f8595966ffa145dee19051ed792b9ff616456e5e`;
- source tree: `845151b300a04ee0ff8ea8cfebd5f3b2e2f922a5`;
- artifact SHA-256:
  `80e3cdafc3e87e4b5a1c973d21cc1683c2f10ad85070dbbd4c389822ab8afa70`;
- artifact files: 1,004;
- archive SHA-256:
  `9aa310c3ee80a8e882b75257f3ac5704ebcad98ef1904fa085220f1b714886e7`;
- Node: exact 22.23.2 locally and in the live release;
- fresh local and Mini extraction/runtime verification: pass;
- readable mode-0700 backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260826-006-20260827T032200Z`
  containing a custom-format `business_v2` dump, WAL-safe SQLite backup,
  installed plist, pre-release health, and relevant flag receipt;
- retained activation rollback plist:
  `~/Library/LaunchAgents/com.nanoclaw.plist.rollback-d5375964f467-2026-08-27T03-22-09-222Z`.

Off-first activation changed exactly the executable, code root, and expected
release commit. Exact release/channel/queue/source/lifecycle/checkout/query
health passed before a semantic one-key plist comparison added only
`RELATIONSHIP_CONTEXT_CLIENT_PROJECTION_ENABLED=1` and performed one bounded
reload.

## Live outcome

The first live run completed at `2026-08-27T03:23:39.862Z`:

| Relationship summary | Parties | Interpretation |
| --- | ---: | --- |
| `paid_customer` | 62 | exact succeeded payment; five also actively subscribed; two also carry an unproven recorded client label |
| `recorded_client` | 7 | client label only; no accepted provenance and no positive customer claim |
| `recorded_student` | 1 | student label only; the other recorded student overlaps a recorded client label |
| `recorded_prospect` | 1,271 | prospect label only; 46 other prospect labels overlap paid customers |
| `unknown` | 96 | no supported relationship evidence; not proof of never being a client |

Aggregate totals and controls:

- 1,437 active Parties and 1,437 active projections; zero merged-Party
  projections;
- 62 `customer_or_client=true`, 62 paid-history, five active-subscription,
  nine recorded-client, two recorded-student, and 1,317 recorded-prospect
  Parties;
- all 1,437 projections are version 1, `partial`, and explicitly unknown for
  active engagement;
- first-run `projectionsChanged=1437`; release-owned exact replay returned
  `projectionsChanged=0`;
- before/after replay remained 1,437 rows, version sum 1,437, max version 1,
  fingerprint `be9bda53b90e80a2836834a713f327ad`;
- prohibited value count 0 and raw identity-like value count 0.

## Non-interference

- exact verified release and code root under one listener;
- Gmail and Slack connected; zero active/waiting containers, zero outgoing
  queue, and zero active pending-send states;
- `party_context_get` remains disabled with zero active grants;
- Trafft and source enrichment remain healthy, complete, read-only, and
  consumer-disabled with their exact prior source totals and zero conflicts;
- student lifecycle remains healthy at 41 events, zero active enrollments, 23
  open exceptions, action consumers off, and Circle off;
- checkout recovery remains production-send enabled with its prior cutoff and
  mode;
- the error-log line baseline remains 273;
- active Party, role, and exact Stripe fact aggregates are unchanged across
  release, enable, and replay.

## Rollback

Disable `RELATIONSHIP_CONTEXT_CLIENT_PROJECTION_ENABLED` and reload before
restoring the retained `d5375964` release pointer if code rollback is required.
Preserve migration-137 projections; ordinary rollback must not delete versioned
relationship evidence. Provider systems require no rollback because this slice
never wrote them.

## Program reconciliation

Company OS state revision 129 marks
`work:relationship-context-client-relationship-projection` done, clears its
claim/next action, and reconciles all nine continuity commitments to
`completed` against this evidence and the exact release receipts. Program
validation passes with no active or eligible work item.

Post-closure observation: production subsequently advanced to exact two-parent
merge `55efd52fb9919c98e75d41d7a6f200fa4ef87ef2`, whose second direct parent is
the verified NC-006 release `f8595966ffa145dee19051ed792b9ff616456e5e`.
Current live health retains complete 1,437/1,437 coverage, 62 paid customers,
five active subscribers, zero-change projection replay state, healthy source/
Trafft/channel/queue state, and disabled query access. This is a superseding
release identity, not a replacement for the recorded NC-006 deployment proof.
