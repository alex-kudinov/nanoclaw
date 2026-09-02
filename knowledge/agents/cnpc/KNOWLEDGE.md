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

<!-- BEGIN CANONICAL PROGRAM FACTS: mcs-foundations-locales -->
## Canonical Mentor Coaching Foundations Language Availability

<!-- program-facts: mcs-foundations-locales revision=1 sha256=b828d032bc14157d3c753bf5b086379d3fc4fdff0df32f3e655de2954684f5ef -->

This block is deterministic authority output. Current provider/public readback
and accepted owner decisions outrank it; website browsing history, model
memory, older messages, and inference do not.

**Mentor Coaching Foundations is currently available as separate self-paced
course journeys in English, French, Japanese, and Spanish.** Never tell a lead
that the course is unavailable in one of these four languages.

| Language | Localized product | Current sales page |
|---|---|---|
| English | Mentor Coaching Foundations | https://tandemcoach.co/mcs/mentor-coaching-foundations/ |
| French | Fondamentaux du mentor coaching | https://tandemcoach.co/fr/fondamentaux-mentor-coaching/ |
| Japanese | メンターコーチング基礎講座 | https://tandemcoach.co/ja/mentor-coaching-foundations/ |
| Spanish | Fundamentos de Mentor Coaching | https://tandemcoach.co/es/fundamentos-mentor-coaching/ |

Availability boundaries:

- These are localized versions of the asynchronous Foundations course. Do not
  imply that the live Mentor Coach Training Standard Path cohort is delivered
  in French, Japanese, or Spanish.
- Tandem's localized delivery does not mean ICF issued translated MCS
  recognition or translated official MCS materials.
- When the lead asks only whether Foundations exists in one of these languages,
  answer yes directly and use the corresponding localized page. Do not invent a
  phone consultation, cohort date, price exception, or enrollment state.
- For any other language, do not guess. State the four currently verified
  languages and ask whether one works for them.
<!-- END CANONICAL PROGRAM FACTS: mcs-foundations-locales -->

<!-- BEGIN CANONICAL PROGRAM FACTS: coaching-supervision-mastery -->
## Canonical Coaching Supervision Mastery Facts

<!-- program-facts: coaching-supervision-mastery revision=1 sha256=285b306d5d8936881009f4663cf2a726896a72a55c860b69193cfcd00f3870c4 -->

This block is deterministic authority output. Current provider/checkout
evidence and accepted owner decisions outrank it; website browsing history,
model memory, older messages, and unmarked prose elsewhere do not.

**Coaching Supervision Mastery is live, ICF-accredited under AACS, and
enrolling now.** Never describe it as in development, pre-launch, a waitlist,
or an interest-only offer, and never say that dates or pricing are not public.

- Program: Coaching Supervision Mastery, Tandem's coaching-supervisor training
  for active ICF PCC or MCC coaches.
- Accreditation: ICF Advanced Accreditation in Coaching Supervision (AACS),
  granted July 22, 2026 for 72 hours and valid through July 31, 2029.
- Pathway distinction: AACS belongs to the education program. The Coaching
  Supervisor Specialization (CSS) is the individual designation a graduate
  applies for through ICF.
- Delivery: approximately 72 hours, 64% live, with 16 live classes; English is
  the only currently verified delivery language.
- Current enrollment: the inaugural cohort runs October 7, 2026 through
  February 10, 2027, Wednesdays at 10:00 AM ET / 9:00 AM CT.
- Tuition: $3,996 for the inaugural cohort, payable in full or four monthly
  payments of $999. Regular tuition is $4,796, or four monthly payments of
  $1,199.
- Enrollment page: https://tandemcoach.co/coaching-supervisor-training/

Schedule boundary:

- Read the operational `SCHEDULE.md` for the latest cohort choices and exact
  dates whenever timing affects the answer.
- A missing or unreadable schedule is an explicit knowledge hold. It is never
  evidence that the program is still in development or has no dates.
- For any language other than English, state that delivery is not currently
  verified and do not infer availability from the lead's location or language.
<!-- END CANONICAL PROGRAM FACTS: coaching-supervision-mastery -->
