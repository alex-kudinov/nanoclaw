# NC-20260829-002 — Bounded Sales narrative-inquiry prompt review

## Objective

Review the narrow Sales prompt change that prevents narrative executive/ADHD
coaching inquiries from being routed as factual `ANSWER` work, mirrored back to
the writer, or converted into unsupported client-prevalence, fit, and outcome
claims.

The desired behavior is calibrated orientation: identify only a candidate
service, keep individual fit and scope unresolved, describe verified service
mechanics, and invite the verified fit conversation without price or promises.

## Non-objectives and protected boundaries

- Do not redesign the seven-route system, approval cards, autonomy ladder,
  pipeline behavior, Mailman handoff, Gmail execution, or host enforcement.
- Do not inspect or transmit `.env*`, credentials, auth/session stores, runtime
  databases, Slack/Gmail history, or any unrelated private/customer material.
- Do not edit source or prompt files. Write only the response artifact named
  below.
- Do not reopen accepted request-first relationship, path-non-authority,
  transaction Route-Basis, support, approval, or delivery decisions.

## Accepted facts

- Base `b7004bb8f4af3ad5f57e17543f378abf35f20b6f` is the exact verified live
  release and contains the exact live Sales prompt hashes at task start.
- The motivating live draft was still pending approval and had no Gmail send
  receipt. No customer email is part of this review.
- The scrubbed regression case preserves the behavior pattern without identity,
  email, or verbatim customer text.
- Existing structural tests do not prove model output quality; the replacement
  draft/live model result will be checked separately after review and release.

## Allowed review artifacts

1. `groups/sales/CLAUDE.md`
2. `groups/sales/CLAUDE-MAIN.md`
3. `groups/sales/WORKFLOWS.md`
4. `groups/sales/VOICE-AND-TONE.md`
5. `groups/sales/EMAIL-RESPONSE-GUIDELINES.md`
6. `evals/sales/request-first-cases.json`
7. `src/sales-prompt-contract.test.ts`
8. This request file

Review the working-tree diff of only those artifacts against `HEAD`.

## Acceptance criteria

Report a material finding only when it can cause one of these outcomes:

1. A narrative such as “I believe I need coaching” can still route as
   `ANSWER/HIGH/YES` merely because keywords match a service.
2. The prompt still rewards paraphrasing biography, distinctive phrases, or a
   symptom list instead of adding a calibrated conclusion.
3. One prospect's message can still become unsupported “most clients,” common-
   pattern, medication-history, guaranteed-fit, or outcome language.
4. The custom-engagement booking exception leaks price, booking, or sales CTAs
   into ordinary `ORIENT` responses.
5. The new rule materially conflicts with existing Sales routes, lessons,
   approval/send gates, or creates an unanswerable instruction.
6. Tests fail to bind the intended route/confidence/answerability and prohibited
   response traits for the scrubbed case.

The intended customer-copy shape is: “ADHD-informed executive coaching may be a
fit here, but we would want to understand the role and goals before saying what
the engagement should look like,” followed by verified mechanics and one
no-obligation fit-conversation invitation. Exact wording is not required.

## Required response

Write `docs/reports/NC-20260829-002-CLAUDE-REVIEW-RESPONSE-R1.md` with:

- `Verdict: NO MATERIAL FINDINGS` or `Verdict: MATERIAL FINDINGS`;
- findings ordered by consequence with exact file/line evidence;
- a short confirmation of protected-boundary compliance;
- no general recap, speculative backlog, or cosmetic preferences.
