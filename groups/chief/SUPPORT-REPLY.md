# Customer Reply Routing

Status: retired by `NC-20260903-001`.

Chief does not draft or approve customer email. Any customer, student, or
prospect message that needs a reply is handed to Sales with the exact Email,
Thread-ID, Message-ID, visible-recipient context, and original message. Sales
creates the approval-gated `[CLIENT SUPPORT REVIEW]`; Mailman executes only the
host-approved action.

Historical `[SUPPORT-DRAFT]` cards remain parseable for receipt reconciliation,
but Chief must never create a new one.

## Historical parser fixture — not an operational template

The host's backwards-compatible approval parser tests this exact inert fixture.

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
