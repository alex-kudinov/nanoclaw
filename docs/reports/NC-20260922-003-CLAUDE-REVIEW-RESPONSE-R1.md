# NC-20260922-003 bounded consent and routing review — Response R1

## Scope confirmation

Reviewed only the eight allowed files listed in the request. Did not read
`webhooks.json`, `data/webhooks.json`, or any other repository file. Traced the
mapper's enum/boolean/entry-page normalization logic by hand against every
case in `src/contact-form-n8n-contract.test.ts` and `src/contact-form-context-contract.test.ts`
and confirmed the code produces the exact asserted outputs (HTML-wrapped enum
values are stripped before allowlist matching via `stripHtml()`'s trailing
`.trim()`; unknown enums fall back rather than dropping the submission;
`normalizeBoolean` correctly rejects `'no'`; `normalizeEntryPage` correctly
rejects query strings, fragments, angle brackets, and malformed `external:`
values). No discrepancy found between the mapper's output keys
(`service_intent`, `buyer_type`, `company`, `preferred_next_step`,
`business_line`, `journey_engine`, `marketing_consent`, `entry_page`) and the
`{{payload.*}}` keys asserted in the prompt-contract test — the field-name
alignment that would most directly cause silent field-loss is intact.

## Findings

1. **Field-loss risk at the two handoff hops that are governed by prose only, not a template — `groups/chief/CLAUDE.md` and `groups/inbox/CLAUDE.md`.**

   `groups/inbox/CLAUDE.md`'s Step 4 handoff (Inbox→Sales) gives an exact,
   copy-literal template with one line per structured field
   (lines 181–188: `Service-Intent: {...}` through `Entry-Page: {...}`), and
   that exact template is regression-tested
   (`src/contact-form-context-contract.test.ts` lines 60–77).

   Neither of the other two paths that also carry contact-form context has an
   equivalent literal template, only a prose rule appended after an example
   that omits the fields entirely:

   - `groups/inbox/CLAUDE.md` lines 214–221 (Approval Protocol, Inbox→Chief
     escalation): the only guidance is "Any contact-form escalation to Chief
     must carry the same `Service-Intent`, `Buyer-Type`, `Organization`,
     `Preferred-Next-Step`, `Business-Line`, `Journey-Engine`,
     `Marketing-Consent`, and non-empty `Entry-Page` lines unchanged." There is
     no shown message format for this escalation path — the agent must
     freehand-compose it.
   - `groups/chief/CLAUDE.md` lines 47–52 give the literal
     `mcp__nanoclaw__send_message(target_group: "sales", text: "...")` example
     for Chief→Sales, and that literal example contains only
     `Name`/`Email`/`Thread-ID`/`Message-ID`/`Source`/`Message` — no
     structured-field lines at all. The requirement to carry
     `Service-Intent`/`Buyer-Type`/`Organization`/`Preferred-Next-Step`/
     `Business-Line`/`Journey-Engine`/`Marketing-Consent`/`Entry-Page` is
     stated only as prose two paragraphs later (lines 65–67), never folded
     into the literal example an implementing agent would copy.

   This is exactly the shape of the field-loss failure mode question 4 asks
   about: the one hop with a literal per-line template is tested and correct;
   the two hops that instead rely on a prose reminder next to a template that
   doesn't include the fields have no such guardrail, and nothing in
   `src/contact-form-context-contract.test.ts` would catch a future edit that
   drops the prose rule or the fields it describes from an escalation.

   **Smallest correction:** add the same seven-plus-`Entry-Page` line block
   used in `groups/inbox/CLAUDE.md` lines 181–188 into (a) the Inbox
   Approval-Protocol escalation bullet in `groups/inbox/CLAUDE.md`, and (b) the
   literal handoff example in `groups/chief/CLAUDE.md` lines 47–52, each with
   the same "otherwise omit" per-line convention already established.

   **Regression proof:** add two `it` blocks to
   `src/contact-form-context-contract.test.ts`, parallel to the existing
   lines 60–77 check, asserting that `groups/inbox/CLAUDE.md`'s escalation
   section and `groups/chief/CLAUDE.md`'s Sales-handoff example each contain
   the same eight `{Field}: {host-` line prefixes. This closes the gap with
   the same mechanism that already protects the Inbox→Sales hop.

No other correctness, privacy, authority, injection, or approval-boundary
issues were found in the allowed packet.
