# NC-20260826-005 — Stripe, contact-form, and verified-Chaos enrichment

Date: 2026-08-27

Program item: `work:relationship-context-stripe-contact-chaos-enrichment`

## Accepted outcome

The live provider-neutral Party Context now imports stable identities and
native facts from both fixed Tandem Stripe accounts, immutable archived
contact-form submissions, and only Chaos visitor links whose verified inbox
and interaction evidence agree on one canonical Party. Every source is
account/scope bound; uncorroborated identities are terminal legacy; query and
all minion consumers remain disabled.

## Aggregate discovery

- Stripe Heartbeat: 173 customers, 412 payment intents, 14 subscriptions.
- Stripe Tandem: 624 customers, 1,013 payment intents, 32 subscriptions.
- Contact form: 191 handled immutable ingress rows, no upstream provider
  submission ID, and no pre-existing inbox Party binding.
- Chaos: 1,331 stable visitor interactions, 38 missing interaction links,
  three Party mismatches, and zero interaction-side visitor-ID multi-Party
  conflicts.
- Exact live lineage remained `1a381e48`; Plutio refs grew naturally from
  1,364 to 1,365 while Trafft remained 159/358 exact and 14/66 legacy.

No raw identity or source payload was written to tracked evidence during
discovery.

## Implementation and independent review

- Implementation commit:
  `7a4a876ba89a3543b57c7ca2841f2d3ce2d41770`.
- Pushed exact release commit:
  `d5375964f4675839e485eb50d3c847472fd8aa6c`.
- Three ordinary adapters: `stripe_account_snapshot@1.0.0`,
  `contact_form_host_ledger@1.0.0`, and
  `chaos_verified_host_ledger@1.0.0`.
- New source runner defaults off, is fire-and-forget/overlap-guarded, isolates
  each source transaction, exposes aggregate-only health, and fixes
  `consumerEnabled=false`.
- Stripe verifies two distinct account identities, partitions over-cap reads
  into bounded half-open time ranges, binds an existing exact customer ref or
  one account-local unique provider email to one canonical Party, and attaches
  payment/subscription facts only through that exact customer ref.
- Contact uses the immutable webhook-inbox row as its exact first-party source
  record, discarding submitted email/name/company/message after matching.
- Chaos expands evidence only for bounded changed visitor IDs. Interaction and
  inbox numeric-ID cycles advance/reset independently, so late lower-ID commits
  and cross-lane volume asymmetry cannot park or permanently skip a source row.
- Claude Sonnet/high R1-R4 found and drove corrections for historical scan
  ceilings, sibling-account admission, malformed visitor accounting, full-
  history Chaos grouping, text-alias numeric ordering, pre-commit sequence
  gaps, and cross-lane cursor parking. R5 returned `NO MATERIAL FINDINGS`.
- Review usage: five bounded sessions, 28 model calls, 527,194 cache-creation
  tokens, 1,571,685 cache-read tokens, 86,310 output tokens, maximum observed
  context 133,759. Every session exceeded the nominal 100k target; this is
  recorded as orchestration debt, not extra confidence.

## Local verification

- focused source/manifest/identity/pagination/wiring: pass;
- disposable PostgreSQL: 4/4, including forced multi-page drain, two complete
  cycles, exact refs/facts/projections, malformed terminal legacy, conflict
  refusal, duplicate-only replay, and PII-negative readback;
- migration-137 SQL integration: pass;
- format, typecheck, build, documentation continuity, capability matrix, diff,
  and secret scan: pass;
- full root: 3,310 pass / 29 skip; the sole failure is the unchanged unrelated
  CNPC source-wrapper literal assertion reproduced on the prior lineage;
- independent runner: build and 45/45 pass;
- release gate: 30 files / 742 tests pass.

## Immutable release and recovery

- source tree: `0b5ce70a110ab4e61070df3bc1062114f624319d`;
- artifact: `2fee654f3bf1a628a6cb48d499f9daa4f1795cfc96a22bad61b40b868594633f`;
- artifact files: 1,000;
- archive:
  `3077222870c627b0b385209f6fac2b44efde57ba1deda9c131410d1d54953a51`;
- Node: exact 22.23.2 locally and on the Mini;
- local and Mini extraction/runtime verification: pass;
- zero active/waiting containers and zero active pending-send states before
  activation;
- readable mode-0700 backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260826-005-20260827T015304Z`
  containing custom `business_v2`, WAL-safe SQLite, installed plist, and
  environment snapshots;
- retained release rollback plist:
  `com.nanoclaw.plist.rollback-1a381e48f746-2026-08-27T01-53-32-613Z`;
- retained pre-enable plist/environment copies in the same backup directory.

The first activation changed exactly the executable, code root, and expected
commit. Enrichment remained off until exact release, channels, queues, Trafft,
checkout, and lifecycle health passed. The one configuration flag was then
added with a sanitized one-key plist diff and bounded reload.

## Live outcome

Exact live release `d5375964f4675839e485eb50d3c847472fd8aa6c`
completed the first source run at `2026-08-27T01:59:13.732Z`:

| Source | Exact refs/facts | Legacy or held | Conflicts |
| --- | ---: | ---: | ---: |
| Stripe Heartbeat | 53 customers, 114 payment intents, 11 subscriptions; 178 observations/projections | 120 customers; 301 native facts held | 0 |
| Stripe Tandem | 22 customers, 27 payment intents, 5 subscriptions; 54 observations/projections | 602 customers; 1,013 native facts held | 0 |
| Contact form | 185 submissions/observations/projections | 6 submissions | 0 |
| Chaos | 1,328 visitors/observations/projections | 40 visitors | 0 |

Durable exact-timestamp replay left observation counts and all projection
versions unchanged at version 1: 1,328 Chaos, 185 contact, and 232 Stripe
projections. Adapter registrations are enabled/passed/closed with zero failures
or error codes. Both source watermark rows are successful with zero failures.

Privacy readback reports zero raw-email values and zero prohibited persisted
keys across email/name/phone/address/IP/payload/metadata/intent/user-agent/
session/referrer/card/amount families.

## Non-interference

- `party_context_get` remains off with zero active grants;
- source enrichment remains read-only and `consumerEnabled=false`;
- no Stripe/payment/customer/subscription, WordPress/n8n/contact-form, or Chaos
  provider write occurred;
- no Party merge, communication, consent, payment/refund/contract action, or
  customer message occurred;
- Gmail and Slack are connected; one listener, zero active/waiting containers,
  and zero source-enrichment errors;
- checkout recovery remains production-send enabled with its exact prior
  cutoff/mode; no checkout setting or case was changed by this work;
- Community lifecycle remains healthy with 41 events, zero active enrollments,
  23 open exceptions, action consumers off, and Circle off;
- Trafft remains healthy/complete at 424/424 duplicate replay, 159/358 exact,
  14/66 legacy, 1,365 Plutio refs, and zero conflicts.

## Rollback

Disable `RELATIONSHIP_CONTEXT_SOURCE_ENRICHMENT_ENABLED` in the installed plist
and reload, then restore the retained `1a381e48` release pointer if code
rollback is required. Preserve migration-137 refs, observations, projections,
exceptions, registrations, and watermark receipts; an ordinary rollback must
not delete historical evidence. Provider systems require no rollback because
this slice never wrote them.
