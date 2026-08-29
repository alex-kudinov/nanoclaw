# NC-20260829-002 — Correction Review Response R2

Verdict: NO MATERIAL FINDINGS

## Acceptance criterion 1 — custom-engagement instruction now unambiguous

`EMAIL-RESPONSE-GUIDELINES.md:10-14` rewrites the General Principle to:

> NEVER suggest consultation calls or discovery calls for fixed-information
> training-program inquiries. The written information should be sufficient for
> them to decide. This does not apply to a supported custom-scoped Executive or
> ADHD Executive Coaching `ORIENT` inquiry, where the fit conversation is the
> defined next step under `WORKFLOWS.md`'s calibrated custom-engagement rule.

This is reinforced, not just asserted once, at `EMAIL-RESPONSE-GUIDELINES.md:35-38`
("`ORIENT` may invite the person to the verified fit conversation under the
calibrated custom-engagement rule... not permission to add price, an outcome
claim, or a second CTA"). `WORKFLOWS.md:47-49` and `WORKFLOWS.md:81-82` use
matching language ("custom-scoped Executive or ADHD Executive Coaching
inquiry/engagement"). A grep of `WORKFLOWS.md` for "consultation"/"discovery"
returns zero hits — the file only ever calls the step 5 CTA a "fit-conversation
invitation" (`WORKFLOWS.md:48`, `WORKFLOWS.md:98`), so the two documents no
longer describe the same next step with words that trigger the ban in one
place and the requirement in the other. The R1 conflict (unconditional ban vs.
unconditional requirement, no precedence rule) is resolved by scoping, not by
a new precedence mechanism — which is sufficient since the two clauses no
longer overlap.

## Acceptance criterion 2 — ordinary training-program inquiries still cannot acquire a discovery-call CTA via ORIENT

The ban's scope is now explicit: "fixed-information training-program
inquiries" (`EMAIL-RESPONSE-GUIDELINES.md:10-11`). The only carve-out is
textually restricted to "a supported custom-scoped Executive or ADHD
Executive Coaching `ORIENT` inquiry" (`EMAIL-RESPONSE-GUIDELINES.md:13-14`).
ACC, PCC, ACTC, Mentor, MCC Mentor, MC Foundations, and Supervision/CSS remain
fixed-information training programs with no matching exemption language
anywhere in `EMAIL-RESPONSE-GUIDELINES.md` or `WORKFLOWS.md` — grepping both
files for "consultation"/"discovery" surfaces only the one ban sentence and no
second exemption. Step 5 of the calibrated custom-engagement rule
(`WORKFLOWS.md:98-100`) and the corresponding guideline
(`EMAIL-RESPONSE-GUIDELINES.md:38`) both cap the exemption at exactly one
fit-conversation invitation with no second CTA or price, so the exemption
cannot be read to license a discovery call for any other route or program.

## Acceptance criterion 3 — the structural test binds the distinction

`src/sales-prompt-contract.test.ts:229-237` asserts, against the live
`EMAIL-RESPONSE-GUIDELINES.md` content:

- `guidelines.toContain('`ORIENT` may invite the person to the verified fit conversation')` (line 229-231) — binds the allow-side text at `EMAIL-RESPONSE-GUIDELINES.md:35-37`.
- `normalizedGuidelines.toContain('NEVER suggest consultation calls or discovery calls for fixed-information training-program inquiries.')` (line 232-234) — binds the retained, now-scoped ban at `EMAIL-RESPONSE-GUIDELINES.md:10-11`.
- `normalizedGuidelines.toContain('This does not apply to a supported custom-scoped Executive or ADHD Executive Coaching `ORIENT` inquiry')` (line 235-237) — binds the exemption clause at `EMAIL-RESPONSE-GUIDELINES.md:13-14`.

I confirmed each literal substring is present in the current file text with no
intervening line break that `toContain`/normalization would break on. All
three assertions are new-or-retained checks that fail if either half of the
distinction (the narrowed ban or its exemption) is edited out or reworded,
which is what "binds the distinction" requires.

## Other R1 items — unaffected

R1's criteria 1-4 and 6 were already found non-material and are not touched by
this correction (no edits to routing, confidence, mirroring, or claim-support
language). This review re-confirms the retained text for those items is
unchanged in the current `WORKFLOWS.md`/`EMAIL-RESPONSE-GUIDELINES.md`.

## Protected-boundary compliance

Reviewed only the five listed artifacts (`NC-20260829-002-CLAUDE-REVIEW-RESPONSE-R1.md`,
`EMAIL-RESPONSE-GUIDELINES.md`, `WORKFLOWS.md`, `src/sales-prompt-contract.test.ts`,
and the R2 request itself), plus two scoped greps confined to
`WORKFLOWS.md`/`EMAIL-RESPONSE-GUIDELINES.md` to confirm no stray unqualified
ban/requirement remained. `evals/sales/request-first-cases.json` was not opened
even though the test file references it. No test was executed. No other
source, prompt, runtime, or private-data path was read or edited. No route
system, approval/autonomy, Mailman/Gmail execution, or prior accepted decision
was reopened or redesigned.
