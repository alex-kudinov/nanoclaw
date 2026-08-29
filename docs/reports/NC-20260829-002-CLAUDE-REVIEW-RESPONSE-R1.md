# NC-20260829-002 — Review Response R1

Verdict: MATERIAL FINDINGS

## Finding 1 (criterion 5 — conflicting/unanswerable instruction): the new fit-conversation invitation is banned by an unmodified, unqualified General Principle

`WORKFLOWS.md:79-100` (Calibrated custom-engagement rule, step 5) requires the
draft to "End with the verified fit-conversation invitation. State that the
first conversation explores goals, fit, and scope..." and `WORKFLOWS.md:47-49`
says this invitation "may include the verified booking link." This is echoed
in `EMAIL-RESPONSE-GUIDELINES.md:31-34` and is a `mustInclude` item
("one fit-conversation invitation") on the scrubbed eval case
`narrative-adhd-executive-coaching-fit` (`evals/sales/request-first-cases.json:134`).

`EMAIL-RESPONSE-GUIDELINES.md:10` — unchanged, in the file's General
Principles, which the file's own header (`EMAIL-RESPONSE-GUIDELINES.md:3`)
says govern "every Sales-authored customer-facing draft" — states
unconditionally: "NEVER suggest consultation calls or discovery calls for
program inquiries. The information should be sufficient for them to decide."

Executive Coaching and ADHD Executive Coaching are listed as `Program
Matching` table entries (`CLAUDE.md:160-161`, rows "Exec" / "ADHD Exec"),
i.e. they are "program inquiries" under this document's own terminology. No
text in any of the seven allowed artifacts scopes the General Principles ban
to exclude the custom-engagement exception, and no precedence rule (of the
kind that exists for `LEARNED.md` overriding `KNOWLEDGE.md`) resolves the
conflict between `EMAIL-RESPONSE-GUIDELINES.md`'s General Principles and
`WORKFLOWS.md`'s calibrated custom-engagement rule.

Consequence: for exactly the case this change targets, the prompt gives two
contradictory instructions — one requiring an invitation to a "fit
conversation" (functionally a discovery/consultation call, with an optional
booking link), the other unconditionally banning discovery/consultation
call suggestions for the same program category. The model has no textual
basis in the allowed artifacts to resolve which instruction wins, so
generated drafts for this exact scenario are unpredictable: some will drop
the required fit-conversation invitation (undermining the objective of this
change), others will include it and read as a direct violation of the
"NEVER suggest consultation/discovery calls" rule as literally written.

Note: `REQUIRE_APPROVAL=1` still gates every send, so this does not create an
unsupervised delivery risk — the conflict shows up as inconsistent/contested
drafts requiring the operator to arbitrate a rule the prompt should have
already resolved, not as content actually reaching a lead unreviewed.

## Other acceptance criteria: no material finding

- **Criterion 1 (narrative routed as `ANSWER`/HIGH/YES):** Blocked in three
  places — `WORKFLOWS.md:24-26` (CURRENT MESSAGE step), `WORKFLOWS.md:40-41`
  (`ANSWER` route definition: "A narrative intake with no factual question
  cannot use this route"), and `CLAUDE-MAIN.md:60-63`. `Program Matching does
  not determine answerability or confidence` (`WORKFLOWS.md:74-77`) also caps
  confidence below `HIGH` for the fit claim.
- **Criterion 2 (rewarding paraphrase/mirroring):** `WORKFLOWS.md:94-97`
  ("Synthesize; do not mirror... Do not open with 'What you're describing,'
  reuse a distinctive phrase... or replay the person's biography or list of
  difficulties") and the Pass 3 audit item at `WORKFLOWS.md:140-141` both
  forbid this, consistent with `VOICE-AND-TONE.md:88-91`.
- **Criterion 3 (unsupported prevalence/medication/outcome claims):**
  `WORKFLOWS.md:90-93` bans prevalence/social-proof language absent an
  authoritative source; `EMAIL-RESPONSE-GUIDELINES.md:28-30` explicitly names
  the medication/treatment-history case; `WORKFLOWS.md:88-89` bans promising
  the engagement will "solve, eliminate, or reliably change" the person's
  difficulties.
- **Criterion 4 (booking exception leaking into ordinary `ORIENT`):** The
  exception is textually scoped to "a clearly supported custom-scoped
  Executive or ADHD Executive Coaching inquiry" (`WORKFLOWS.md:47-49`,
  `WORKFLOWS.md:81-82`), and step 5 of the rule forbids a second CTA or price
  (`WORKFLOWS.md:98-100`, `EMAIL-RESPONSE-GUIDELINES.md:33-34`). Aside from
  the discovery-call conflict in Finding 1, no leak into other `ORIENT`
  responses is present.
- **Criterion 6 (tests fail to bind route/confidence/answerability/traits):**
  `src/sales-prompt-contract.test.ts:216-251` binds the scrubbed case's
  `expectedRoute`/`expectedConfidence`/`answerability`/`draftExpected` via
  `toMatchObject` and asserts the prohibited-trait list via
  `arrayContaining`. This is a structural/data-contract check, consistent
  with the Accepted Facts disclosure that these tests do not verify actual
  model output quality — not a defect introduced by this change.

## Protected-boundary compliance

Reviewed only the working tree of the eight listed artifacts. No source or
prompt file was edited. No `.env*`, credential, auth/session, runtime
database, or Slack/Gmail content was read or referenced. No route system,
approval/autonomy, Mailman/Gmail execution, or prior accepted decision
(request-first relationship, path-non-authority, Route-Basis, support,
approval, delivery) was reopened or redesigned.
