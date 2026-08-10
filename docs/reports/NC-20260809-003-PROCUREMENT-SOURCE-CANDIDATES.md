# NC-20260809-003 Procurement source candidates

Date checked: 2026-08-09; official-source refresh: 2026-08-10

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

## 2026-08-10 official-source refresh

This refresh broadens discovery without changing the activation order or the
closure gate. It uses issuing-body pages as authority; the third-party portal
behind an official link is transport, not authority for issuer identity.

| Tier | Source | Evidence of useful coverage | Recommended treatment |
| --- | --- | --- | --- |
| A | [California DGS upcoming solicitations](https://www.dgs.ca.gov/PD/Procurement-Division) | DGS publishes a separate forward-looking list in addition to Cal eProcure. The current official list includes workforce-development consulting and training categories, so it is materially relevant rather than a generic bid directory. | Add as **forecast intelligence**, not an open opportunity feed. A forecast row may prompt monitoring but may not create a pursuit until an authoritative solicitation exists. Prefer a deterministic PDF/table snapshot with document-date and row-count receipts. |
| A | [UC CalUsource public bid site](https://procurement.ucop.edu/) | UC states that the public site covers bid opportunities across all campuses. | Evaluate a public, read-only adapter after SAM.gov. Keep campus/issuer identity explicit. Registration, questions, and responses remain human-only. |
| A | [CSU CSUBUY public bid portal](https://www.calstate.edu/csu-system/doing-business-with-the-csu/contract-services-and-procurement/supplier-resources) | CSU exposes a public bid portal for its universities and Chancellor's Office and documents that registration is required to participate, not to identify the public source. | Evaluate a public adapter after UC. Do not automate supplier onboarding or authenticated event actions. Treat SDSU separately until CSU's own rollout page says it is covered. |
| B | [Los Angeles County open solicitations](https://isd.lacounty.gov/services/procurement/) | The County's official procurement page links public open and awarded solicitation searches by commodity, department, title, description, and number. | First measure official alert/public-search yield through the receipted email route. Build HTML acquisition only if it adds unique relevant opportunities. Vendor registration is human-only. |
| B | [San Diego County BuyNet and procurement forecast](https://www.sandiegocounty.gov/content/sdc/purchasing.html.html) | The County publishes both open solicitations and a forward procurement forecast. | Treat open notices and forecast rows as different evidence classes. Prefer alerts; never promote a forecast into an open pursuit without the later solicitation. |
| B | [Orange County Open Bids](https://cpo.ocgov.com/open-bids-county-contracts-portal) | The County's official page publishes active solicitations through OpenGov and offers follow/notification functions. | Measure public listing access and exact issuer IDs before considering an OpenGov adapter. Account creation, following, and response submission are human actions. |
| C | [Federal agency procurement forecasts](https://www.acquisition.gov/procurement-forecasts) | Acquisition.gov indexes official recurring forecasts across major agencies. | Use only for pipeline intelligence and target-account planning. SAM.gov remains the authority when a notice becomes open. |
| Hold | [SBA SUBNet](https://subnet.sba.gov/client/dsp_solicitation_details_3.cfm) | SBA exposes public subcontracting listings, but currently says new posting is unavailable and the observed mix is heavily construction-oriented. | Do not implement yet. Reassess only if a manual relevance sample shows unique coaching, training, facilitation, or organizational-development yield. |

### Portfolio rule

Do not build one generic `Jaggaer`, `OpenGov`, `GEP`, or portal scraper and call
it a source. A shared transport library is acceptable, but each issuing system
must retain its own canonical issuer URL, planned units, stable opportunity ID,
coverage receipt, and amendment/cancellation semantics. Activate candidates one
at a time and retain only those that add measured unique relevant yield beyond
Cal eProcure, SAM.gov, and exact-resource email intake.

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
