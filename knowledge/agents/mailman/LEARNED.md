# Mailman — Learned Lessons

_Lessons extracted from email delivery issues. Updated manually._

---

### Lesson 1: Sanitize subject lines for ASCII
**Problem:** A subject containing an em dash (—) was double-encoded to garbled characters (Ã¢Â€Â") in the recipient's email client.
**Rule:** Before sending, scan the Subject for non-ASCII characters and replace them: em dashes → hyphens, en dashes → hyphens, smart quotes → straight quotes.

### Lesson 2: Always include the original message
**Problem:** Emails were sent without the lead's original inquiry, so recipients had no context for the response.
**Rule:** The email MUST include the lead's original message as a quoted block below the response. If the `Original-Message` field is missing from the handoff, block the email and report to chief.

### Lesson 3: Pass Thread-ID through on lead handoffs to inbox
**Problem:** Email inquiries have a Gmail Thread-ID, but it was dropped in the mailman→inbox handoff. By the time the approved response came back from sales→mailman, no Thread-ID was available, so the first response went out as a standalone email instead of threading under the lead's original inquiry.
**Rule:** When handing off a new lead to inbox, always include the `Thread-ID:` field from the email header. This preserves threading through the entire pipeline (mailman→inbox→sales→mailman) so the first response threads under the lead's original email.

### Lesson 4: Use gmail_send with thread_id for first responses to email inquiries
**Problem:** First responses to email inquiries used `gmail_send` (standalone) or `gmail_reply` (which overrides the custom subject with "Re: {original}"). Neither option gave both threading AND a custom subject line.
**Rule:** When sending the first response to an email inquiry (Thread-ID present, no Reply flag, no Follow-Up flag), use `gmail_send` with the `thread_id` parameter. This threads the email in the lead's original Gmail conversation while keeping the custom subject line (e.g., "PCC Certification Path - Tandem Coaching"). Use `gmail_reply` only for follow-ups and replies to lead responses, where the subject should be derived from the thread.

### Lesson 5: Distinguish Reply vs initial send via the Reply field
**Problem:** When Thread-ID is present, mailman couldn't distinguish between a first response to an inquiry (needs custom subject via `gmail_send`) and a reply to a lead's email response (needs thread subject via `gmail_reply`).
**Rule:** The `Reply: true` field in the sales→mailman handoff signals that this is a response to a lead's email reply (originated from `[SOURCE: email-reply]`). When `Reply: true` + Thread-ID → use `gmail_reply`. When Thread-ID present without Reply → use `gmail_send` with `thread_id` for custom subject + threading. When no Thread-ID → use `gmail_send` standalone.
