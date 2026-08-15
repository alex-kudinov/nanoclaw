# Mailman — Learned Lessons

_Lessons extracted from email delivery issues. Updated manually._

---

### Lesson 1: Subject encoding handled by the host (no sanitization needed)
**Status (2026-05-06):** Fixed at the system level. `src/gmail-api.ts::encodeHeaderValue` RFC 2047-encodes any non-ASCII Subject before the message hits Gmail's `messages.send`, so em dashes, en dashes, smart quotes, and accented characters arrive intact.
**Original problem (resolved):** A subject containing an em dash (—) was double-encoded to garbled characters (Ã¢Â€Â") in the recipient's email client.
**Rule:** Pass the Subject through as written. Do NOT preemptively replace em dashes or smart quotes — that was a workaround for the now-fixed encoding bug.

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

### Lesson 6: New taxonomy label: MrGru/notification/monitoring — classify Labrika as monitoring
**Problem:** Labrika (labrika.com) sends automated weekly SEO and site health audit reports for tandemcoach.co. These were previously classified as MrGru/vendor/cold and escalated, but Alex wants them classified as a monitoring report and surfaced in the daily digest without escalation.
**Rule:** A new taxonomy label has been approved: `MrGru/notification/monitoring` — Automated site health, SEO audit, uptime, or performance reports (hive: alex, priority 1). Classify all emails from Labrika (info@labrika.com or any @labrika.com sender) as `MrGru/notification/monitoring`. Do not escalate these. They will appear in the daily digest for Alex's review. Also use this label for other automated site/uptime monitoring services (e.g. UptimeRobot, Pingdom, Google Search Console alerts).

### Lesson 7: Classify Forwardly emails as MrGru/notification/system — do not escalate
**Problem:** Forwardly (bank payment platform) sends automated notifications about bank connection status. These were escalated as financial alerts but Alex wants them ignored/auto-archived.
**Rule:** Classify all emails from Forwardly (any @forwardly.com sender or subject containing 'Forwardly') as MrGru/notification/system. Auto-archive. Do not escalate to chief or flag to Alex/Cherie. These are routine automated platform notifications.

### Lesson 8: New taxonomy entries: MrGru/lead/declined and MrGru/association/event
**Problem:** Two email types lack taxonomy entries: (1) Explicit opt-out/decline replies from leads (e.g. 'No thank you') were classified as MrGru/other. (2) Professional association correspondence (e.g. ICF Converge proposal decisions) has no category.
**Rule:** Two new labels approved: (1) MrGru/lead/declined — Explicit opt-out, unsubscribe, or 'not interested' reply from a lead or prospect. Auto-archive. No hive share, priority 0. When a lead sends a clear decline, classify as MrGru/lead/declined and suppress all future automated outreach to that email address. (2) MrGru/association/event — Correspondence from ICF, EMCC, Scrum Alliance, or other professional associations about events, conferences, proposals, or membership. Hive: cherie+alex, priority 1. Also: classify internal Tandem calendar invite updates and forwards (from cherie@tandemcoaching.academy or alex@tandemcoach.co) as MrGru/notification/calendar, not MrGru/other. Heartbeat community event reminders (from events@heartbeat.chat or The Hearth) should be MrGru/notification/system, auto-archived.

<!--
Lesson 9 (2026-05-25): "Always dress up approved replies" — REMOVED.
It contradicted mailman's VERBATIM RULE (groups/mailman/CLAUDE.md:49) and would
have caused mailman to start altering sales drafts. The Ken Kelling polishing
failure is being fixed upstream: chief now drafts a polished email from
operator intent and runs its own draft/approve loop before handing off to
mailman. Mailman remains a verbatim sender — never alter handoff body content.
-->


### Lesson 9: Sent-mail echoes from info@tandemcoach.co must be suppressed, not escalated
**Problem:** Mailman classified a sent-mail echo from info@tandemcoach.co as MrGru/internal/team and escalated to chief. This was an outbound email sent by mailman itself, reflected back as an inbound message. No action is needed on these.
**Rule:** Emails arriving from info@tandemcoach.co, info@tandemcoaching.academy, or any @tandemcoach.co / @tandemcoaching.academy address are sent-mail echoes. Classify as MrGru/internal/team, auto-archive, and do NOT escalate to chief. The existing suppression rule (@tandemcoach.co/@tandemcoaching.academy never inbound) applies — treat these as noise, not escalations.

### Lesson 10: MrGru/notification/calendar — auto-archive, never escalate
**Problem:** Mailman correctly classified a Google Calendar acceptance notification as MrGru/notification/calendar but then escalated to chief with 'Reason: unrecognized label'. These emails require no human action and should be silently archived.
**Rule:** When an email is classified as MrGru/notification/calendar (calendar invites, acceptances, rescheduling notices, event confirmations from Google Calendar or any calendar system), auto-archive it immediately. Do NOT escalate to chief. Do NOT keep in inbox. This label is purely informational — no agent action is needed. Treat it identically to MrGru/notification/system for disposition purposes: classify, archive, done.

### Lesson 11: notification/calendar must auto-archive; sent-mail echoes from @tandemcoach.co must be suppressed — recurring pattern
**Problem:** Mailman received a sent-mail echo (outbound reply to eckerson.counseling@gmail.com, from info@tandemcoach.co) and classified it as MrGru/notification/calendar, then escalated to chief with 'unrecognized label'. This is the same pattern as Lessons 9 and 10 in LEARNED.md, which have not yet been reflected in KNOWLEDGE.md. The pattern keeps recurring.
**Rule:** Two rules, both mandatory: (1) Emails from any @tandemcoach.co or @tandemcoaching.academy address are sent-mail echoes — outbound email reflected back as inbound. Auto-archive immediately. Do NOT escalate to chief. Do NOT classify as a lead, client, or inquiry. (2) Emails classified as MrGru/notification/calendar (calendar invites, acceptances, rescheduling notices, event confirmations, appointment-related automated replies) must be auto-archived immediately. Do NOT escalate to chief. Do NOT keep in inbox. There is no valid escalation path for MrGru/notification/calendar — treat it identically to MrGru/notification/system: classify, archive, done.

### Lesson 12: Unsolicited podcast guest invitations are cold vendor spam — classify MrGru/vendor/cold
**Problem:** The Sunnyside Podcast (f.barker@thesunnysidepodcast.com) sent three unsolicited guest invitation emails to Alex and they were escalated to chief each time. Alex confirmed these are spam.
**Rule:** Unsolicited podcast guest invitation emails (cold outreach asking Alex or Cherie to appear as a guest) are cold vendor/PR spam. Classify as MrGru/vendor/cold and auto-archive. Do not escalate to chief. Specific rule: sender_exact:f.barker@thesunnysidepodcast.com → MrGru/vendor/cold.

### Lesson 13: MrGru/association/event is a defined label — do not escalate as unrecognized
**Problem:** Mailman escalated an ICF (support@coachingfederation.org) email labeled MrGru/association/event to chief with reason 'unrecognized label'. That label is already defined in the taxonomy (KNOWLEDGE.md line ~626): 'Correspondence from ICF, EMCC, Scrum Alliance, or other professional associations about events, conferences, proposals, or membership (hive: cherie+alex, priority 1)'.
**Rule:** MrGru/association/event is a known category. Route it via normal hive share to cherie+alex at priority 1 (stays in inbox, not archived). Do not escalate to chief for this label. Only escalate genuinely unrecognized labels (i.e. MrGru/other, or a label string that does not appear in the taxonomy list at all).
