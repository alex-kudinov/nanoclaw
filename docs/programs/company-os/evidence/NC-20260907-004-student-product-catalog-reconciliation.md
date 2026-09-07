# NC-20260907-004 — student product catalog read-only reconciliation

Date: 2026-09-07

## Outcome

A privacy-minimized source-bound draft now covers 56 selected source/disposition records, not canonical orders or unique offers: 47 checkout entries, the catalog-only MCS offer, seven native Product Map non-student counterparts, and one French learning counterpart without a sellable-offer inference. All 37 active checkout entries have one treatment and one disposition. Canonical catalogs, provider objects, business or runtime state, and primary program state remain unchanged.

## Source coverage

- Checkout: 47 local working-tree entries and 37 active; selected safe fields are unchanged from Tandemweb HEAD, while deployment identity remains unverified.
- Roster: 156 Product Map rows and 0 invalid targets; zero student rows read.
- Heartbeat: 101 groups and 40 courses; 24/25 declared groups and 20/20 declared courses exist.
- Stripe: 128 products across two namespaces; all nine declared product references exist, with three exact default-price matches and six native null defaults.
- Plutio: bounded template and custom-field structure is exhausted; no item-level offer or agreement binding is exposed, and two project references remain unverified.
- Curriculum: 30 ICF course records; 18/20 catalog-declared course IDs were found in the scanned managed course manifests. The other two are service containers, so no curriculum-absence conclusion is made.
- Schedule: all six supported calendar program reads recovered successfully; five accepted delivery blocks retain the committed-seat simple-sync boundary.
- Publishing discovery: 33/37 active checkout slugs have a bounded static page-source reference; four evaluation-training slugs were not found. The page catalog predates ES and JA sources, so index absence is not publication absence.

## Disposition and publication boundary

Disposition counts: {"legacy_dispositioned":16,"source_bound":7,"unresolved":33}. Treatment counts: {"component_service_fulfillment":19,"enrollment":24,"grant_free_access":5,"non_student_sale":7,"unresolved":1}. The audit records observed local active or inactive state without granting grandfathering, an allowlist, or an enforced publication block. Holding new or changed publication is an unapplied proposal requiring acceptance and implementation evidence. Inactivity alone is not retirement evidence.

## Material contradictions and safe holds

1. PCC practice-test catalog group ID is absent and source-unreproducible; do not substitute the near-match native group.
2. Foundations locale variants have checkout and provider evidence without accepted offer or bundle bindings.
   2a. A French learning counterpart has source and native course evidence but no checkout or page source; no sellable offer is inferred.
3. MCS uses dated checkout slugs and account-scoped products around one program-wide enrollment; exact variant and agreement meaning remains unsettled.
4. Two declared and native service-container course IDs were not found in the scanned managed course manifests; another service, allowance, procedure, or schedule source may be appropriate.
5. Courses documentation still assigns Plutio superseded student-master authority.
6. Provider existence does not prove attachment, fulfillment, agreement, enrollment, progress, assessment completion, or capacity.
7. Payer, purchaser, sponsor, participant, and student remain distinct roles. This audit read no identities and establishes no per-record relation among them.

## Privacy and external effects

No people, students, members, progress, payments, invoices, contracts, assessment records, credentials, invitation codes, secret URLs, or raw provider payloads are retained. Provider access was read-only. No deployment, release, migration, message, catalog application, or program mutation occurred.
