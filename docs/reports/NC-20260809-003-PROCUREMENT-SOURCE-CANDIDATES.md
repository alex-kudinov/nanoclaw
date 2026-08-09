# NC-20260809-003 Procurement source candidates

Date checked: 2026-08-09

Status: research only. The accepted recovery gate still forbids connecting a
new feed until one public opportunity completes the migration-115 closure
canary. This report does not authorize registration, authenticated scraping,
terms acceptance, or submission.

## Recommended order

| Priority | Source | Why it is useful | Preferred integration | Gate or risk |
| --- | --- | --- | --- | --- |
| 1 | [SAM.gov Get Opportunities Public API](https://open.gsa.gov/api/get-opportunities-public-api/) | Official federal opportunity feed with stable fields, pagination, active notices, and documented v2 endpoint | Deterministic host adapter using a user-created read-only API key; daily bounded date window; explicit pagination and coverage receipt | Requires a SAM.gov public API key. Keep the key host-only. Do not use the federal opportunity-management write API. |
| 2 | Existing exact-resource Procurement email intake | Lowest-risk way to cover amendments and portals that already offer vendor alerts | Subscribe the Procurement mailbox only after the migration-115 email route and backlog alert are live-verified | Registration and terms remain human-owned. Every alert must receive a `routed_at` receipt or surface as backlog. |
| 3 | [Illinois Higher Education Procurement Bulletin](https://www.procure.stateuniv.state.il.us/about.cfm) | Public universities publish RFP, RFI, professional/artistic, and other notices; strong fit for coaching, facilitation, and organizational-development work | Start with the Bulletin's documented email notifications through exact-resource Gmail intake; later assess a bounded public-listing adapter | Account/IPG registration is required for e-bidding and remains human-only. Do not automate login or bid submission. |
| 4 | [City of Chicago active solicitations](https://webapps1.chicago.gov/vcsearch/solicitations) and [Cook County opportunities](https://apps.cookcountyil.gov/Procurement_EDS/BidList) | Official local professional-services opportunities with clear active/due-date listings | Prefer official notifications or a public read-only adapter with stable IDs and a measured change detector | No documented API was found in this pass; require terms/robots review and fixtures before HTML automation. |
| 5 | [Illinois BidBuy](https://www.bidbuy.illinois.gov/bso/) | Official statewide public Open Bids and solicitation details | Prefer public bulletin/email intake; evaluate a read-only adapter only after access-contract review | Registration is free but login, acknowledgement, quote upload, and pricing-lockbox actions are human-only. |
| 6 | [Texas ESBD](https://comptroller.texas.gov/purchasing/vendor/information.php/1000) | Official statewide state/local opportunity search and CMBL invitation channel | Prefer official email invitations/alerts through Gmail; keep the existing public-search adapter only if coverage remains measurable | Existing browser automation is brittle; CMBL registration/profile changes remain human-only. |
| 7 | [Grants.gov applicant API](https://www.grants.gov/api) | Structured, official funding-opportunity search that may expose training or workforce-development grants | Separate `grant` source adapter and qualification profile; do not mix grant eligibility with procurement scoring | This is funding, not procurement. Add only after the bid loop is stable and the owner accepts a separate funnel. |
| 8 | [SAM.gov contract awards data](https://sam.gov/content/contract-data) / USASpending | Award history can reveal buying agencies, incumbents, cadence, and likely pricing scale | Read-only research/calibration input linked to an opportunity, never a solicitation source | Intelligence only; must never create a fake open opportunity or automatic pricing claim. |

## Sources to hold or retire

- Bonfire authenticated automation stays paused until its browser capability is
  isolated from other agent VMs, allowlisted, read-only, and receipt-bearing.
  The current unauthenticated shared CDP bridge is not a production source.
- Commercial aggregators may be useful for recall comparison, but they should
  not become authority for deadlines, amendments, or submission instructions.
  Prefer the issuing body's notice and retain its stable reference.
- Generic web search is discovery assistance, not a completeness-bearing feed.

## Adapter acceptance contract

Every new source must prove all of the following before it can be scheduled:

1. documented access authority and credential boundary;
2. stable source opportunity ID and canonical issuer URL;
3. explicit planned units, pagination/watermark, and terminal coverage receipt;
4. deterministic normalization and replay-safe idempotency key;
5. amendment and cancellation handling;
6. no login, acknowledgement, registration, upload, submission, signature,
   attestation, terms acceptance, or pricing commitment;
7. one shadow run and one owner-reviewed public canary before routine enablement.

## Recommendation after the closure canary

Implement SAM.gov first. It is the only high-value candidate in this pass with
a documented official opportunity API and a clean host-owned read boundary.
In parallel, add human-configured Illinois Higher Education, Chicago/Cook
County, and BidBuy notifications to the now-receipted Procurement email route.
Use those alert streams to measure which public HTML adapter would add enough
unique relevant opportunities to justify its maintenance cost.
