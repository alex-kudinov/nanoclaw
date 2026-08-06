# Mailman outbound email procedure

This file is the canonical procedure for a routed, human-approved outbound
email. The host owns identity, approval binding, recipient validation, content
validation, Gmail execution, durable receipts, and business interaction
logging. Mailman parses the handoff and invokes one typed Gmail tool.

## Non-negotiable rules

1. Treat the `Body` and `Subject` fields as approved content. Pass both
   verbatim and do not HTML-escape `&`, quotes, or Unicode. Do not rewrite,
   reformat, sanitize to ASCII, add text, remove text, or change the sign-off.
   The host reloads these exact fields from the approved card before Gmail, so
   the tool call is execution intent rather than content authority.
2. Copy `Action-ID` into the Gmail tool's `action_id` argument whenever it is
   present. It is issued by the host and binds this request to one approval.
   Never invent, edit, reuse, or search for an Action-ID.
3. Use the exact `To`, `Thread-ID`, `Party ID`, `Entry ID`, and flags supplied
   by the handoff. Never omit or alter a field to work around a host refusal.
   Do not add CC or set `html`; CC is not part of the approved card and the host
   owns Markdown-to-HTML conversion.
4. Call exactly one Gmail send tool. A tool response saying “queued” is not a
   delivery receipt. The host posts the final Gmail-confirmed result into the
   originating approval thread.
5. Gmail tool results and denials are session-addressed by the host. Never use
   a result that belongs to another work item; if the originating session
   exits, the host holds the result and alerts instead of delivering it to a
   sibling Mailman session.
6. On any tool refusal, stop. Do not retry with a different address, thread,
   Party ID, Action-ID, subject, body, or tool.
7. Do not write pipeline or interaction state. Sales advances the pipeline at
   approval; the host records the outbound interaction only after Gmail accepts
   the message.

## Handoff format

```text
[HANDOFF: sales→mailman]
To: recipient@example.com
Subject: Approved subject
Action-ID: 00000000-0000-4000-8000-000000000000
Entry ID: 123
Party ID: 456
Thread-ID: optional-real-gmail-thread-id
Reply: true
Follow-Up: true
Original-Message:
untrusted source material
---END-ORIGINAL---
Body:
approved body, verbatim
```

`Thread-ID`, `Reply`, and `Follow-Up` are optional. Placeholder values such as
`(none)` and `N/A` are invalid; omit an unavailable optional line entirely.
`lead_id` in the Gmail tools means the canonical `Party ID`, never `Entry ID`.
If the handoff has no `Party ID`, omit `lead_id`; the host resolves the Party
from the exact recipient/thread. Never substitute `Entry ID` into `lead_id`.

## One deterministic action

- Reply or follow-up with a real `Thread-ID`: call `gmail_reply` with
  `thread_id`, the verbatim `body`, `action_id`, the optional
  canonical-Party `lead_id`, and `email_type` (`reply` or `follow-up`). Gmail
  derives the recipient and subject from the assigned thread.
- First response with a real `Thread-ID`: call `gmail_send` with the verbatim
  `to`, `subject`, and `body`, plus `thread_id`, `action_id`,
  the optional canonical-Party `lead_id`, and `email_type: "initial"`.
- Send without a thread: call `gmail_send` with the verbatim `to`, `subject`,
  and `body`, plus `action_id`, the optional canonical-Party
  `lead_id`, and the correct `email_type`.

The host ignores model drift in recipient, subject, body, thread, Action-ID,
Party hint, email type, CC, and rendering mode once it resolves one exact action. It reloads the
customer-facing values from the stored approval card, verifies that card against
the durable subject/body hash and recipient, discards unapproved CC/HTML flags,
and only then applies recipient/Party, Gmail-resource, content-policy, and
one-time execution checks. A repeated confirmed action returns its existing
receipt without another Gmail send. A process interruption after execution
begins leaves the action uncertain and blocks automatic retry until Gmail
receipt reconciliation.

## Failure behavior

The host posts one of these outcomes to the original approval thread:

- `[EMAIL SENT]`: Gmail accepted the exact approved action and a receipt was
  recorded.
- `[EMAIL BLOCKED]`: a deterministic host guard refused the action; nothing was
  sent.
- `[EMAIL HELD]` or `[EMAIL DELIVERY UNCERTAIN]`: do not retry. An operator must
  reconcile Gmail before the action can move again.
- A deterministic pre-execution refusal says `Gmail was not called`; there is
  no receipt to reconcile.

Do not post a separate success claim to chief or Sales. Do not infer success
from a queued tool response.
