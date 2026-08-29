# Bounded review: checkout failure customer remediation

## Objective

Review the implementation that turns a known Stripe payment failure into:

1. a persistent, localized, customer-safe remediation state inside the active
   Tandem checkout; and
2. failure-specific localized guidance in the already-active, consented
   two-touch Encharge recovery flow.

Report only material correctness, privacy, safety, localization-contract,
delivery-gate, or customer-confusion findings. Do not restate the design or
invent a backlog. Write the response to the exact response path below.

## Authority and accepted decisions

- Owner instruction is to implement the immediate failure explanation and a
  helpful follow-up if the customer leaves.
- Accepted program decisions are
  `decision:checkout-failure-customer-recovery-2026-08-29` and
  `decision:checkout-failure-specific-followup-2026-08-29`.
- The existing active Encharge flow is `400441`, event
  `checkout_recovery_reminder_ready_v2`, templates `479523`-`479530`.
- Existing host gates are accepted and must remain: prospective cutoff,
  affirmative v2/v3 consent, current/sibling purchase suppression, touch-one
  provider acceptance before touch two, touch-two reply check, unsubscribe and
  preference enforcement, idempotency, cross-case guard, and ambiguous-lease
  hold.
- In this Encharge account, dedicated person fields are the proven rendering
  surface; event-property merge tags previously rendered blank.
- Raw Stripe codes/messages and sensitive decline detail may not be rendered or
  projected to Encharge. Six closed safe guidance categories are authoritative.
- No historical outreach, manufactured payment/failure, refund, retry, CRM,
  enrollment, or customer communication is part of validation.
- Generic abandonment (no known failure key) must remain distinct from a known
  failure.

## Changed implementation

NanoClaw:

- `src/checkout-recovery-guidance.ts` supplies EN/ES/FR/JA customer copy for
  every safe key and generic incomplete checkout.
- `src/checkout-recovery-sender.ts` projects localized subject, guidance
  title/body, support URL, safe key, and failure-specific flag into the existing
  event/person payload.
- `src/checkout-recovery-store.ts` carries the retained safe key into touch
  scheduling.
- `src/checkout-recovery-guidance.test.ts` and
  `src/checkout-recovery-sender.test.ts` cover copy/template safety and payload
  shape.
- `docs/programs/company-os/provider-assets/checkout-recovery/` is the tracked
  source for the eight existing Encharge templates. All render the person-field
  contract, fresh-checkout CTA, human support, preferences, and unsubscribe.

Tandemweb companion worktree:

- `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/assets/js/checkout.js`
  maps Stripe.js errors to the same safe keys and dynamically creates a
  persistent focused failure panel with localized reason, retry, and support.
- `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/assets/css/checkout.css`
  styles that state.
- `/private/tmp/tandemweb-stripe-customer-20260829/wordpress/tandem-snippets/tests/test-checkout-recovery-shadow.php`
  protects the no-raw-error and dedicated-step contract.

Design/source-of-truth updates are in `docs/CHECKOUT-FAILURE-RECOVERY.md` and
`docs/CHECKOUT-RECOVERY-CONTROL.md`.

## Review questions

1. Can any raw or sensitive Stripe error detail reach checkout DOM, analytics,
   or Encharge through these changes?
2. Does every classification produce an accurate, actionable safe explanation,
   including `do_not_honor`, authentication, data errors, temporary failures,
   sensitive failures, and unknowns?
3. Is the website state persistent and operable enough to replace the prior
   transient banner without breaking retry or payment controls?
4. Does the sender preserve all existing scheduling/suppression gates while
   reliably supplying every template field for both known failures and generic
   abandonment?
5. Will all eight templates avoid blank guidance and retain support,
   preference, unsubscribe, and fresh-checkout semantics?
6. Are any claims such as “you were not charged” unsafe for a Stripe.js error
   category represented here?

## Verification already completed

- NanoClaw focused: 14/14 passing.
- NanoClaw TypeScript typecheck: passing.
- Tandemweb JavaScript syntax: passing.
- Tandemweb checkout recovery static contract: passing.
- Provider templates have not yet been updated and no event/email was sent.

## Allowed and forbidden access

Read only the files named above and files directly imported by the changed
NanoClaw modules when necessary to verify a material claim. You may Glob/Grep
only within the two isolated worktrees. Do not read `.env*`, credentials,
auth/session stores, database dumps, customer data, primary dirty worktrees, or
unrelated project files. Do not use Bash, network, MCP, Git mutation, or edit
implementation files.

Write only:

`/private/tmp/nanoclaw-checkout-recovery.PqylpU/docs/reports/NC-20260829-001-CUSTOMER-REMEDIATION-CLAUDE-RESPONSE.md`

Use one of these outcomes: `NO MATERIAL FINDINGS` or `CHANGES REQUIRED`, then
list only material findings ordered by consequence with exact file/evidence
references and a concise correction criterion.
