# Support Reply Drafting

Chief drafts → operator approves → mailman sends. This replaces the old
"Approved Reply Passthrough" pattern, which forwarded operator chat text
verbatim and produced unpolished client-facing emails.

## When this applies

When Alex or Cherie tells you in `#gru-chief` to reply to a client escalation,
the chat text is **operator intent, not finished email copy**. Draft a polished
email from that intent, get explicit approval, then hand off to mailman.

Lead inquiries still route to sales. This path is only for support replies Chief
is handling itself.

## The verbatim contract

**Never relay operator chat text directly to mailman.** Mailman is a verbatim
sender: whatever you put in the handoff body goes out word-for-word. The host
will arm an approval only when it can slice the exact recipient, subject, and
body from the posted card without guessing.

## Step 1 — Post a draft for approval

Post this exact structure to `#gru-chief`:

<!-- APPROVAL-CARD-TEMPLATE:START -->

```text
[SUPPORT-DRAFT]
Thread-ID: {gmail_thread_id}
To: {recipient_email}

THEIR REQUEST:
{1-2 line summary of the client's problem, plus the original message verbatim quoted below}

DRAFT RESPONSE:
---
Subject: Re: {subject}

{polished email body — see Composition Rules below}
---

React ✅ to approve | reply with edits to iterate
```

<!-- APPROVAL-CARD-TEMPLATE:END -->

The two `---` lines are mandatory. `Subject:` must be the first nonblank line
inside them. The email body is everything after `Subject:` and before the
closing `---`; operator-facing summaries and approval instructions stay outside.

## Step 2 — Iterate until approved

If the operator replies with edits ("warmer", "shorter", "mention the refund
window"), post a complete revised `[SUPPORT-DRAFT]` block in the same exact
structure. Repeat until the operator replies `Approved`, ✅, or "send it".

## Step 3 — Hand off to mailman only after approval

The host normally emits the canonical handoff from the bytes the operator
approved. If Chief is instructed to emit it, use this exact field structure and
copy the host-issued Action-ID without inventing or changing it:

```text
[HANDOFF: chief→mailman]
To: {recipient_email}
Subject: Re: {subject}
Action-ID: {host_issued_action_id}
Thread-ID: {gmail_thread_id}
Original-Message:
{client's original message verbatim}
---END-ORIGINAL---
Body:
{the approved DRAFT RESPONSE body, byte-identical to what was approved}
```

The body and subject in the handoff must be byte-identical to the approved card.
Never send without the host-issued Action-ID. A queued Mailman response is not a
delivery receipt; wait for the Gmail-confirmed outcome in the approval thread.

## Step 4 — Capture iteration as a lesson when it is a pattern

If the operator's edits reveal a recurring pattern, call `route_lesson` with
`target_agents=['chief']`. One-off corrections do not need a lesson.

## Composition rules

- **Greeting:** "Hi {first_name}," — never "Dear" or "To whom it may concern".
- **Structure:** a short acknowledgment, the answer/action, and a warm close.
- **Voice:** warm, direct, and free of filler or jargon.
- **Length:** under 120 words for routine support; longer only when necessary.
- **Apologies:** only when Tandem actually caused the problem.
- **Sign-off:** "Warmly,\nTandem Coaching Team" unless explicitly directed
  otherwise.
- **Links:** spell out the URL; do not rely on markdown link rendering.

## Rules

- Use this path only when Alex or Cherie gave intent for a support reply.
- The fenced DRAFT RESPONSE is polished customer-facing copy, ready to ship.
- Always preserve the real Thread-ID and original message in the handoff.
- Never skip approval, even for a trivial reply.
- Never change the recipient, subject, or body after approval.

## Worked example

```text
[SUPPORT-DRAFT]
Thread-ID: 198abc...
To: learner@example.com

THEIR REQUEST:
The learner cannot access the course because the welcome email did not arrive.

> {original message quoted verbatim}

DRAFT RESPONSE:
---
Subject: Re: Course access

Hi there,

Sorry about the delivery hiccup on the welcome email — that's on us.

You can log in directly at community.tandemcoaching.academy using the email
address you registered with. If you hit any trouble at the login screen, reply
here and we'll sort it.

Warmly,
Tandem Coaching Team
---

React ✅ to approve | reply with edits to iterate
```
