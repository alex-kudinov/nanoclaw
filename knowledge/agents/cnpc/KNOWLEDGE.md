# CNPC Intake Coordinator — Knowledge Base

## Program Rules

CNPC provides individual and team coaching for nonprofit and analogous public-service organizations. For-profit organizations are ineligible under the current public application rules. Ambiguous organization type, operating-expense band, program track, or coaching type requires human review.

The host calculates eligibility and pricing. The minion must never override or recalculate those fields from prose.

## Published Price Tiers

For organizations with annual operating expenses under $250,000:

- Individual coaching: $300
- Team coaching: $500

For organizations with annual operating expenses from $250,000 through $499,999:

- Individual coaching: $400
- Team coaching: $700

For organizations with annual operating expenses of $500,000 or more:

- Individual coaching: $600
- Team coaching: $1,100

Pricing is stored in cents by the host. If the operating-expense band is unknown, do not quote a price.

## Matching Rules

The coach roster in the host-provided match pool is authoritative for the current run. A coach is included only when the canonical roster says active, the work type matches, a recent capacity response exists, and capacity remains after active chemistry-call holds.

Rank for demonstrated fit with the stated need. Use explicit coach preference when that coach is present and suitable. Use language and time-zone alignment where supplied. Balance opportunities by using current load and remaining capacity as tie-breakers.

Do not use the old Word bench, public website, onboarding-response count, or availability-response count as roster authority. Those sources disagree and must be reconciled into the host ledger.

## Capacity Semantics

- Declared available slots come from the latest accepted coach availability response.
- An active chemistry-call invitation or booking creates a temporary soft hold with an expiry.
- A hard slot is committed only after both contract signature and payment are confirmed by host receipts.
- Pending matches and chemistry calls must be visible when balancing opportunities, but they are not hard commitments.

## Lifecycle

The intended lifecycle is:

1. Application received and stored idempotently.
2. Eligibility and price derived deterministically.
3. Eligible, active, capacity-bearing coaches filtered by the host.
4. Minion ranks top two plus a backup and posts a review.
5. Approved match email is sent through a host-owned mailbox action with a delivery receipt.
6. Client selects chemistry-call coaches.
7. Approved coach introductions include host-stored booking links and create expiring soft holds.
8. Client selects a coach.
9. CNPC Plutio contract and invoice are created from approved templates.
10. Host confirms signature and payment receipts.
11. Ready-to-begin email is sent and the selected coach capacity is committed.

Steps 5 through 11 remain disabled until their host connectors, approver identities, templates, and receipts are configured and verified.

<!-- BEGIN CANONICAL PROGRAM FACTS: practitioner-series -->
## Canonical Practitioner Series Facts

<!-- program-facts: practitioner-series revision=2 sha256=d84b3b06db50d74eb38d4a55b55acf0a9d5d654d66aaa791d3dc935fe117af00 -->

This block is deterministic authority output. Provider evidence and accepted owner decisions outrank it; website prose, lessons, memories, presentations, and prior messages do not.

- Current public portfolio: 7 live courses; 6 are ICF CCE-approved programs.
- Approved pathway total: 150 CCE hours (77 Core Competency + 73 Resource Development).
- Setting Up Your Coaching Practice is live but deliberately outside the CCE track. It carries no CCE claim.
- CCE is continuing education, not a credential or certification.
- Ethics wording: a course may teach three ethics hours inside its approved Core Competency total, but these approval records do not show ICF separately designating or awarding ethics hours. Keep the course documentation; ICF makes the final renewal determination.

| Course | Current accreditation fact |
|---|---|
| Setting Up Your Coaching Practice | No CCE claim |
| Running a Coaching Business | ICF CCE-approved: 40 hours, 9 Core Competency + 31 Resource Development; provider documents 3 ethics-instruction hours inside Core, not separately ICF-designated |
| Coaching Tools Mastery | ICF CCE-approved: 20 hours, 13 Core Competency + 7 Resource Development |
| AI for Coaches | ICF CCE-approved: 20 hours, 6 Core Competency + 14 Resource Development; provider documents 3 ethics-instruction hours inside Core, not separately ICF-designated |
| Career & Transition Coaching | ICF CCE-approved: 20 hours, 14 Core Competency + 6 Resource Development; provider documents 3 ethics-instruction hours inside Core, not separately ICF-designated |
| ADHD Coaching | ICF CCE-approved: 20 hours, 13 Core Competency + 7 Resource Development; provider documents 3 ethics-instruction hours inside Core, not separately ICF-designated |
| Systemic Coaching for Executive Teams | ICF CCE-approved: 30 hours, 22 Core Competency + 8 Resource Development; provider documents 3 ethics-instruction hours inside Core, not separately ICF-designated |

Current approved splits supersede submitted targets and older page, course, slide, narration, brochure, minion, and email text.
<!-- END CANONICAL PROGRAM FACTS: practitioner-series -->
