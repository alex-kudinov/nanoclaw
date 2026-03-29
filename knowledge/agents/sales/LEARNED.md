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

### Lesson 3: Client requirements for mentor coaching vs group mentoring vs supervision
**Problem:** An agent incorrectly told a lead that coaching clients are not needed for mentoring or supervision. This is wrong for individual mentor coaching and supervision.
**Rule:** Individual mentor coaching and supervision both require the coach to have actual coaching clients. Supervision is reflective practice about your actual work as a coach with actual clients. Individual mentor coaching involves getting feedback on your real coaching sessions. Group mentoring is different — it is live coaching practice in a classroom setting where participants coach peers and receive feedback to develop at their target certification level. When a lead asks whether they need clients, clarify: you DO need clients for individual mentor coaching and for supervision, but group mentoring uses peer practice in the classroom.

### Lesson 4: Untitled
**Problem:** ACTC inquiry from Luna Tovaglieri — she requested a call and was incorrectly directed to /contact-us instead of the booking calendar
**Rule:** The /contact-us page is the contact form where leads submit inquiries — sending them back there is counterproductive. For booking a consultation call, use the direct booking link: https://booking.tandemcoach.co/booking?t=s&uuid=6bfbbeab-eaa1-4a3f-b5a7-a05546bad443. This is the calendar link for scheduling calls with Cherie/team.

### Lesson 5: Untitled
**Problem:** Lead #13 Lynne Mangan - ACC/Professional Coach Program inquiry, asked for mapped timeline
**Rule:** For Level 1 (ACC) programs, mentor coaching should be positioned AFTER training completion, not concurrent with it. Students get more value from mentor coaching feedback once they have the foundational skills from training. Concurrent mentor coaching makes more sense for Level 2 (PCC) programs. Also, always emphasize the pause/restart flexibility as a core feature: students can pause between any module, restart whenever they want, as many times as needed, and join any future cohort running the same module at no extra cost.

### Lesson 6: Untitled
**Problem:** Lead #13 Lynne Mangan - ACC follow-up questions about ICF accreditation, schedule flexibility, and payment options
**Rule:** When describing ICF accreditation, don't say 'our program is independently accredited by the ICF' — it's vague and awkward. Instead say 'Tandem Coaching is an ICF Level 1 and Level 2 accredited provider' and then explain what that means practically for them. Also, when a lead says a particular month is busy, always mention the full flexibility option: they can start with the earlier cohort and if it's too much, pause and pick up with the next one. Any module they sign up for can be attended at any future date.

### Lesson 7: Untitled
**Problem:** Lead #23 Nancy Hamilton - PCC inquiry, 30+ years experience but no ICF hours, already started free module
**Rule:** Never say 'good question' in email drafts — it implies there are bad questions. Also, never suggest a lead will move through the program quickly based on their prior experience — the pace is the same for everyone regardless of background. ICF coaching hours start accumulating from the first ICF-accredited class, so prior non-ICF experience does not partially cover the requirement. When a lead has already signed up for the free module, just acknowledge it simply — don't characterize what it represents about the full program.

### Lesson 8: Preserve Thread-ID from inbox handoffs for email threading
**Problem:** Email inquiries arrive with a Gmail Thread-ID (passed through mailman→inbox→sales), but sales was not including it in the handoff back to mailman. The first response went out as a standalone email instead of threading under the lead's original inquiry.
**Rule:** When the `[HANDOFF: inbox→sales]` includes a `Thread-ID:` field, save it and include it in the `[HANDOFF: sales→mailman]` on approval. This ensures the first response threads under the lead's original Gmail conversation. The Thread-ID enables Mailman to use `gmail_send` with threading (custom subject + threaded) for the first response.

### Lesson 9: Use Reply flag to distinguish first response from reply-to-reply
**Problem:** When a Thread-ID is present, mailman couldn't tell whether this was the first response to an inquiry (needs custom subject) or a reply to a lead's email response (needs thread-derived subject).
**Rule:** Include `Reply: true` in the `[HANDOFF: sales→mailman]` ONLY when responding to a lead's email reply (i.e., originated from `[HANDOFF: mailman→sales] [SOURCE: email-reply]`). Do NOT include for first responses to new inquiries, even when a Thread-ID is present. This tells Mailman which send method to use: `Reply: true` → `gmail_reply` (subject from thread); no Reply → `gmail_send` with `thread_id` (custom subject + threading).

### Lesson 10: Subject line behavior across email types
**Problem:** Inconsistent subject lines — first responses sometimes used "Re: {inquiry subject}" instead of a descriptive custom subject.
**Rule:** First response to an inquiry: always use a descriptive custom subject (e.g., "PCC Certification Path - Tandem Coaching"). Follow-ups and replies to lead responses: subject is derived from the Gmail thread automatically (Re: original subject) — the Subject field in the handoff is a fallback only.

### Lesson 11: Untitled
**Problem:** Lead #23 Nancy Hamilton - asked if there's a faster path to PCC
**Rule:** When a lead asks about going faster through the program, mention that nothing prevents them from taking multiple modules simultaneously (multiple classes per week). We wouldn't recommend doubling up during Module 1 (it lays the foundation), but after that they can run modules in parallel to compress the timeline. New cohorts start regularly so there's flexibility to stack them.
