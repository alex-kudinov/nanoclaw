# Sales — Learned Lessons

_Lessons extracted from feedback on draft emails. Updated automatically on approval._

---

<!-- Entries appended by learn_lesson IPC handler -->

### Lesson 1: Original message MUST be in the handoff
**Problem:** Drafts were approved and handed off to Mailman without the lead's original inquiry. The lead received a response email with zero context about what they asked.
**Rule:** The `[HANDOFF: sales→mailman]` MUST include the `Original-Message:` field containing the lead's original message verbatim (from THEIR REQUEST). This is not optional. Mailman will block the email if it's missing.

### Lesson 2: Subject lines must be ASCII-only
**Problem:** A subject line contained an em dash (—) which was double-encoded to garbled characters (Ã¢Â€Â") in the recipient's email client.
**Rule:** Never use em dashes, en dashes, smart quotes, or any non-ASCII character in the Subject line. Use hyphens (-) and straight quotes instead.
