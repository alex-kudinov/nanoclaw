# Sales — processing protocol and program matching

Loaded with `CLAUDE.md`.

## Processing Protocol

For `[SOURCE: contact-form]`, the handoff may include structured submission
context. Treat `Service-Intent`, `Buyer-Type`, `Organization`, and
`Preferred-Next-Step` as explicit selections or text from the same customer
submission. They are current-message evidence about what the person chose and
how they prefer to proceed, but they do not prove fit, budget, purchase
readiness, legal authority, or a prior relationship. The message remains the
more specific expression of the request; if it materially conflicts with a
selection, preserve the conflict and use `CLARIFY` or `HUMAN` rather than
silently choosing. `Business-Line` and `Journey-Engine` are host-derived
routing metadata only. `Marketing-Consent` is separate optional permission for
occasional resources and must never change the response route, create purchase
intent, authorize a customer email, or alter the approval boundary. Preserve
these lines across every draft, revision, approval, and Chief handoff just as
you preserve the message and `Entry-Page`.

Apply `CONSULTATIVE-DIALOGUE.md` selectively on every customer turn. Answer
specific questions immediately; explore advice that depends on unstated goals;
do both for mixed inquiries. Reassess each reply, never label the person
permanently. Read the playbook before an exploratory or mixed response.

1. Parse handoff. **Keep the Thread-ID** if present and carry it across every
   round: the host threads the approved reply from the thread root's
   Thread-ID, or from a `Thread-ID:` line in the card header. If this is a
   reply inside an existing email conversation whose root has no Thread-ID
   (for example a correction to an email we sent after a contact-form lead),
   put the real Thread-ID in the card header, from the party's latest outbound
   email: `psql -tAc "SELECT metadata->>'thread_id' FROM
   business_v2.interactions WHERE party_id = ${PARTY_ID} AND direction =
   'outbound' AND channel = 'email' ORDER BY occurred_at DESC LIMIT 1;"`. A
   `Re:` subject with no thread is re-attached by the host, but a real
   Thread-ID is better. **Exception:** `[SOURCE: forwarded-email]` /
   `[FORWARDED-INQUIRY: send-new-email]` deliberately has no reply Thread-ID:
   `Source-Thread-ID` is the internal forwarding thread and must never be
   copied, recovered, or passed as `Thread-ID`; the approved card goes to the
   host-resolved external lead address as a new email. **Save the
   host-supplied
   `Visible-To`, `Visible-Cc`, `Reply-All-Candidates`, and `Recipient-Context`
   lines across every draft/approval round.** They are
   current-message context, not permission; use the bounded rule in
   `WORKFLOWS.md` and never invent or expose BCC. **Save Known-To-Us** if
   present, but apply the evidence gate in `WORKFLOWS.md`: only evidence that
   predates the current inbound can establish a relationship. If it is absent
   or insufficient, set relationship to `unknown`. Do not run a post-intake
   contact-card lookup to infer relationship; inbox may have created those
   records for this inquiry. **Do not resolve or create an Entry ID before
   choosing the route.** For `[SOURCE: email-support]` or another
   evidence-supported `SERVICE` case, follow `WORKFLOWS.md → Client Support
   Review`; no Entry ID or pipeline mutation is required. For a genuine sales
   inquiry, follow `WORKFLOWS.md → Resolving Missing Entry ID` before posting a
   Sales Review card.
2. If the Operator-answer fast path applies, skip all reads/lookups and go
   directly to the Client Support Review card. Otherwise read
   `/workspace/extra/knowledge/KNOWLEDGE.md`.
3. Run the deterministic Request-First Decision Procedure in `WORKFLOWS.md`. Use this exact precedence: **RELATIONSHIP → CURRENT MESSAGE → ANSWERABILITY → ROUTE/BUDGET → PATH NON-BINDING**. For a contact form, CURRENT MESSAGE includes the structured customer selections under the boundary above, with the free-text message controlling when it is more specific. Do not select a program, quote a price, add a cohort, or propose a next step until the first four decisions justify it. Broad browsing-path evidence remains quarantined from customer-facing drafting. The only exception is a host-supplied contact-form `Entry-Page`, which may resolve one explicit page-relative reference under the narrow boundary in `WORKFLOWS.md`; it supplies no fact or commercial authority.
4. Draft and audit the response using Request-First Draft Review (see `WORKFLOWS.md`). **Hard rule on program assumptions:** if the current message and thread do not establish a program and no valid `Entry-Page` resolves an explicit page-relative reference, do not silently assume one or use browsing behavior to infer one. Ask one focused clarifying question when that can safely resolve the request; otherwise abstain and request human input. Never quote ACC pricing/cohorts/timezone for a "what time are classes?" message that did not establish ACC. Alex caught this exact failure on the Marius case (2026-04-27).
   **Hard rule on narrative coaching inquiries:** a person describing their role,
   challenges, and belief that they need coaching is asking for orientation, not
   a factual `ANSWER`. Program-matching keywords identify only a candidate
   service; they do not establish answerability, confirmed fit, typical-client
   prevalence, or promised outcomes. Use the calibrated custom-engagement rule
   in `WORKFLOWS.md`: state that the service may be a fit, describe only verified
   service mechanics, and reserve engagement scope and fit for the first
   conversation. Never open by replaying the person's biography, phrases, or
   symptom list.
5. Post the audited draft using the route-appropriate Draft Format in `WORKFLOWS.md`. It carries a one-line `Email:` field (the host threads on it), an optional exact `Cc:` only under the sender-requested reply-all or Alex/Cherie-directed rule, and a short THEIR ASK excerpt — **not** the full inbound. The verbatim message is already the thread root; repeating it makes the operator scroll the same text twice and pushes the card past Slack's length limit.
6. For a genuine Sales Review with an Entry ID, update DB. For a Client Support Review, skip this step entirely:
   ```bash
   psql -c "SELECT business_v2.fn_advance_pipeline_stage({entry_id}, 'qualifying', 'sales review');"
   ```

## Program Matching (only after route selection)

Use this table only when an `ORIENT` or `TRANSACT` route requires a program
match. It is not a checklist for adding offers to `ANSWER`, `SERVICE`,
`CLARIFY`, `HUMAN`, or `DECLINE` responses. A match is a candidate for a
calibrated response; it is never evidence that the person is definitely a fit,
that Tandem has seen this exact pattern before, or that coaching will produce a
particular result.

| Signal                                                                                                                    | Match                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "ACC", "certification", "new to coaching"                                                                                 | ACC                                                                                                   |
| "PCC", "upgrade", "next level"                                                                                            | PCC                                                                                                   |
| "team coaching", "ACTC"                                                                                                   | ACTC                                                                                                  |
| "mentor coaching", "renewal"                                                                                              | Mentor                                                                                                |
| "MCC", "master coach", "MCC credential"                                                                                   | MCC Mentor                                                                                            |
| "mentor coach specialization", "MCS", "MCQ" (legacy alias), "become a mentor coach", "mentor coaching foundations", "CPL" | MC Foundations                                                                                        |
| "supervision", "reflective practice"                                                                                      | Supervision (receiving supervision, a service)                                                        |
| "coaching supervisor", "become a supervisor", "supervision training/qualification", "CSS", "CSQ", "AACS"                  | Coaching Supervision Mastery (CSS track — supervisor training)                                        |
| "executive coaching", "leaders"                                                                                           | Exec                                                                                                  |
| "ADHD"                                                                                                                    | ADHD Exec                                                                                             |
| Multiple or unclear                                                                                                       | Use `ORIENT` only when the person asks for options and stated needs support them; otherwise `CLARIFY` |

When multiple programs plausibly fit, do not list them by default. If the
person asked for orientation, compare only the supported options; otherwise ask
the relevant question(s) under the selective consultation playbook. Missing
personal goals call for dialogue, not operator escalation. Reserve `HUMAN` for
unavailable authoritative facts, policy decisions, or specialist judgment.
