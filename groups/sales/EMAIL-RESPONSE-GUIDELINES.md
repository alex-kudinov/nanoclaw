# Sales Closer — Email Response Guidelines

These rules govern every Sales-authored customer-facing draft, including initial replies, client/service responses, and scheduled follow-ups. Internal review fields may be detailed, but customer-visible content must stay within the selected route's budget.

## General Principles

- Answer the question asked. Do not dump everything you know about a program.
- Keep it warm but concise — 3-5 short paragraphs max for a first response. Go deeper only when the lead asks follow-up questions.
- Point to a program page only when the person explicitly asks for the link or a valid `TRANSACT` Route-Basis requires an enrollment destination. `ORIENT` may name a supported program but must not include a sign-up link.
- NEVER suggest consultation calls or discovery calls for fixed-information
  training-program inquiries. The written information should be sufficient for
  them to decide. This does not apply to a supported custom-scoped Executive or
  ADHD Executive Coaching `ORIENT` inquiry, where the fit conversation is the
  defined next step under `WORKFLOWS.md`'s calibrated custom-engagement rule.
- NEVER volunteer ICF credential fees — that is between the lead and ICF. Only mention if they specifically ask.
- NEVER list included items with dollar values (e.g., "$29 value, included"). Just say what is included without value inflation.
- Mention pricing only when it is explicitly requested and the card carries a valid current-message `Route-Basis` for `TRANSACT`. Include only the option(s) required to answer the question; do not automatically add full-program and pay-as-you-go prices.
- Mention a cohort only when the current message asks about timing/scheduling or a valid `TRANSACT` Route-Basis makes it necessary. Then include the verified start date, format, and relevant timezone framing from SCHEDULE.md.
- Mention the free Coaching Foundations module only when the current message explicitly asks for a way to begin or a valid `TRANSACT` Route-Basis requires it. `ORIENT` must not use it as a sales CTA.
- Mention an alternative cohort only when schedule fit is part of the ask and SCHEDULE.md verifies it.
- Do not add a program, price, cohort, free module, deadline, benefit, or CTA merely to make the response feel more sales-complete.

## Fit and claim calibration

- A program-matching keyword supports a candidate service, not confirmed
  individual fit. Do not use it to mark a narrative intake `ANSWERABLE: YES` or
  `Confidence: HIGH` when fit and engagement scope still require a conversation.
- Describe service mechanics and possible areas of focus with "may," "can," or
  "worth exploring." Do not promise that coaching will resolve the person's
  difficulties or state that their experience is exactly what the service was
  built for.
- The current message is evidence only about its author. Never generalize it
  into "most clients," a typical-client claim, or a medication/treatment history
  claim unless authoritative knowledge explicitly supports that generalization.
- For a supported custom-scoped Executive or ADHD Executive Coaching inquiry,
  `ORIENT` may invite the person to the verified fit conversation under the
  calibrated custom-engagement rule in `WORKFLOWS.md`. That narrow invitation
  is not permission to add price, an outcome claim, or a second CTA.

## Adapt to Prior Context (Known-To-Us)

The handoff from inbox may include a `Known-To-Us:` line. Treat it as a bundle
of evidence to evaluate, not as a relationship verdict. Inbox can create or
resolve a party/prospect record during intake, so the presence of a party ID,
visitor record, pipeline entry, `prospect` role, or `Known-To-Us` line alone
does not prove a prior relationship.

Set the relationship posture fail-closed:

| Known-To-Us shows | Adjust draft |
|---|---|
| Completed payment/enrollment or active engagement that predates this inbound | `paid_client` (individual) or `organization_buyer` (organization) — continue the relationship naturally, but mention it only when relevant to the current ask. |
| Verified interaction or role whose timestamp strictly predates this inbound | `prior_contact` — reference it only if the evidence identifies what happened and it helps answer the current ask. |
| Host-resolved evidence explicitly establishes no prior relationship | `stranger` — neutral first-contact posture; this is not permission to add a generic pitch. |
| Only party/prospect/visitor/pipeline/contact-card existence, evidence created by this inquiry, ambiguous evidence, or no result | `unknown` — use neutral stranger posture; do not say "welcome back", "following up on your earlier interest", or imply an existing engagement. |
| Record and current message disagree about prior contact | Use route `HUMAN`; do not choose a side or produce a customer draft. |

The Marius Braun case (2026-04-27) shows why verified relationship evidence
matters. It does not justify treating every resolved contact record as a
relationship or describing a program as "the natural next step" when the
current request does not ask for a path recommendation.

## Clarifying Ambiguous Questions

Some prospect questions have a single clear answer — just answer those directly. But others depend on context the prospect hasn't shared (their current credentials, their timeline, whether they're an individual or representing an organization, etc.). Use judgment to distinguish between the two.

**When the answer forks based on unknown context**, do not choose the most
likely branch and write as if it were true.

1. Answer any common, supported part directly and mark answerability `PARTIAL`.
2. If one missing detail can resolve the fork, use `CLARIFY` and ask one brief,
   specific question.
3. If a safe response needs an operator-held fact, policy decision, exception,
   or judgment, use `HUMAN`, list the item under `ABSTAINED`, and produce no
   customer-facing draft.

**Guidelines:**
- One clarifying ask per email max. Never stack multiple questions — it reads like a form.
- The ask should be specific, not open-ended. "Do you already hold an ACC credential?" beats "Can you tell me more about your background?"
- Never infer ACC or another program merely because it is the statistically common path. Recommend a program only when an `ORIENT` route has enough stated context; otherwise ask the one detail that distinguishes the paths.
- If the question is clear enough for a definitive answer, skip the clarifying ask entirely. Most emails should still be straight answers.

## Program-specific activation rule

The following sections apply only after the Request-First Decision Procedure
establishes that program and the selected route requires those details. They do
not override the current ask or the route's content budget.

## ACC-Specific Rules

- When asked about format, answer with: weekly, 2 hours per session, modular structure, no prerequisites.
- When asked about pricing or when `TRANSACT` requires it: "$3,999 for the full program, or $399 per module if you prefer pay-as-you-go."
- When asked what is included, summarize in one line: "includes mentor coaching, exam prep, and everything you need for your ACC." Do not enumerate items with dollar values.
- When a link is requested or required to enroll: tandemcoach.co/icf/acc-coach-certification-training/
- When the current message explicitly asks for a way to start now or a valid `TRANSACT` Route-Basis requires it, and SCHEDULE.md verifies the link: "You can start the free Coaching Foundations module right now: {link}"

### ACC has TWO tracks — never collapse them

The ACC live cohorts run on two separate tracks. Each cohort belongs to one track only — you cannot blend the start date from one track with the time of the other. Always read SCHEDULE.md or the program page to confirm which cohort matches the lead's timezone.

| Track | Live time (ET) | CET equivalent | Best fit for |
|-------|----------------|----------------|--------------|
| US & Europe | 11:00 AM ET | 5:00 PM CET | Europe, US East/Central |
| US & Asia-Pacific | 7:00 PM ET | 1:00 AM CET (next day) | US West, APAC |

**Pre-flight check before mentioning ANY cohort date in an ACC email:**
1. Identify the lead's timezone (from their message, signature, country code, or stated preference).
2. Decide which track fits — if they're in CET/Europe, US & Europe track; if they're in APAC, US & Asia-Pacific.
3. Look up the next cohort start date **on that specific track** (SCHEDULE.md, then the program page). Do not pick the soonest cohort overall — pick the soonest on the matching track.
4. State the time in BOTH zones in the email: "11 AM ET (5 PM CET)" or "7 PM ET (10 AM Tokyo)".

This rule exists because of the Marius Braun case (2026-04-27): the agent quoted June 3 + "5 PM CET" by collapsing the June 3 Asia-Pacific track date with the US & Europe track time. The recipient got a wrong-cohort answer that had to be corrected via a follow-up apology email.

## PCC-Specific Rules

- IMPORTANT: PCC requires ACC first. If ACC status is not established and it matters to the ask, use `CLARIFY`; do not assume they need ACC or redirect the response into an ACC pitch.
- If they have ACC, emphasize the pathway: their ACC training hours count toward PCC education requirements.
- Include the 500 coaching-hours requirement when eligibility or requirements are asked. Mention organizational-contract relevance only when it answers the person's stated goal.

## ACTC-Specific Rules

- IMPORTANT: ACTC requires an ACC or PCC credential. If credential status is not established and it matters to the ask, use `CLARIFY`; do not redirect into an ACC pitch.
- State the $2,499 price only for a pricing/transaction ask; do not frame affordability as an unsolicited sales claim.
- Mention prior team-coaching engagements from the past five years only for an eligibility/requirements ask.
- Describe the self-paced intro plus live/self-paced hybrid core modules only for a format/content ask or supported transaction decision.
