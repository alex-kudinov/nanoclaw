# Mailman — Learned Lessons

_Lessons extracted from email delivery issues. Updated manually._

---

### Lesson 1: Sanitize subject lines for ASCII
**Problem:** A subject containing an em dash (—) was double-encoded to garbled characters (Ã¢Â€Â") in the recipient's email client.
**Rule:** Before sending, scan the Subject for non-ASCII characters and replace them: em dashes → hyphens, en dashes → hyphens, smart quotes → straight quotes.

### Lesson 2: Always include the original message
**Problem:** Emails were sent without the lead's original inquiry, so recipients had no context for the response.
**Rule:** The email MUST include the lead's original message as a quoted block below the response. If the `Original-Message` field is missing from the handoff, block the email and report to chief.
