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

### Lesson 12: Untitled
**Problem:** Lead #27, PCC/MCC exam prep inquiry — lead asked for free version after receiving paid link
**Rule:** Free PCC/MCC exam prep is accessed via a form at the bottom of tandemcoach.co/icf-credentialing-exam/ — it sends a link to the free prep test. The paid version ($49) is at https://community.tandemcoaching.academy/invitation?code=FA9C52. Always direct leads to the page URL first, not just the paid enrollment link.

### Lesson 13: Untitled
**Problem:** Lead #29, ACTC inquiry from team/corporate coach in Italy who explicitly requested a consultation call
**Rule:** When a lead explicitly asks for a consultation call, respond short and sweet with just the Cherie booking link — don't provide a full program breakdown they didn't ask for. The first draft included a detailed ACTC overview and clarifying question; Alex wanted just the call link. Honor the call request directly.

### Lesson 14: Untitled
**Problem:** Lead #30, ACC Module 1 enrollee asked how long the Coaching Foundations module is
**Rule:** The Coaching Foundations module is self-paced and does not need to be completed before Module 1. It's a reference covering ICF competencies, ethics, and coaching basics that students can dip in and out of throughout the course. Do not imply it must be done upfront.

### Lesson 15: Untitled
**Problem:** Follow-up #2 drafts for multiple leads — Alex flagged this language pattern
**Rule:** Never say 'I've reached out twice' or 'I've sent a couple of messages' in follow-up emails — it sounds rude and desperate. Instead, open by referencing what you sent them (e.g., 'Following up on the ACC details I shared') without counting the outreach attempts.

### Lesson 16: Untitled
**Problem:** Lead #34, ACC inquiry asking about learning format and accelerated options
**Rule:** When a lead asks about acceleration, mention two mandatory constraints that set the floor on overall timeline: (1) mentor coaching requires 10 hours spread over a minimum of 3 months per ICF rules; (2) the ACC credential requires 100 coaching practice hours, which typically takes longer than the coursework itself. These are the real limiting factors, not the training modules.

### Lesson 17: ACC program emails should mention self-paced online learning component
**Problem:** Sales emails about the ACC program were not mentioning self-paced online learning, which is a significant part of the program format. Cherie flagged this as an omission when reviewing an email to a lead.
**Rule:** When describing the ACC program format to leads, always mention that a significant portion of the learning is self-paced online content (not just live sessions). The ACC is a hybrid program: self-paced online modules plus live Zoom cohort sessions. Calling this out helps leads understand the flexibility and time commitment involved.

### Lesson 18: Do not state 'April 13' or mid-month dates as ACC cohort start dates
**Problem:** Two outbound emails to leads (Tonya Conley and Quetta Noble) incorrectly stated 'the next cohort starts April 13.' Cherie Silas flagged this as wrong. Cohorts start the first week of the month, not mid-month.
**Rule:** Never state a specific mid-month date as a cohort start. ACC cohorts start in the first week of the month. If you do not have a confirmed upcoming cohort date, say 'cohorts run monthly — the next one starts in early May' or similar. Do not invent specific dates. For mentor coaching group sessions, the next confirmed cohort starts May 5, 2026.

### Lesson 19: Untitled
**Problem:** ACC inquiry, new coach worried about accumulating 100 coaching hours (75 paid) required for ACC credential
**Rule:** Initial draft on Lead #37 described the 100-hour coaching requirement as difficult without mentioning how students actually solve it. Reviewer added that most students use Reciprocoach — a platform where coaches exchange sessions with each other for a nominal fee — to build their hours alongside others in the same position. Always mention Reciprocoach when addressing the 100-hour practice hour requirement for new coaches who are worried about finding clients.

### Lesson 20: ACC instructor credentials — do not overstate in email copy
**Problem:** A sales email for the ACC program claimed that 'our instructors hold the highest ICF credential,' implying all ACC instructors are MCCs. In fact, Kalina Terzieva and Karen Bruns (who teach ACC) hold the PCC credential, not MCC. Cherie flagged this as a bait-and-switch because students may expect MCC-level instructors but encounter PCC-level ones in the actual program.
**Rule:** When describing ACC program instructors, never make blanket claims that all instructors hold the highest ICF credential (MCC). Accurately represent the instructor team: Cherie Silas and Alex Kudinov are MCCs; Kalina Terzieva and Karen Bruns are PCCs. The MCC-level distinction applies specifically to mentor coaching (included in the program), not to all instruction. Use the full instructor list accurately, or describe the program as taught by MCCs and PCCs, or simply list instructors by name and credential.

### Lesson 21: Tandem does not keep individual class recordings
**Problem:** A PCC/ACTC student asked where to find video recordings of his classes. The initial draft reply incorrectly suggested recordings exist and offered troubleshooting steps for finding them.
**Rule:** Tandem Coaching does not keep individual class recordings. When a student asks about class recordings, clarify this and direct them to the class materials available in their course pages on the Community Tandem Coaching Academy (community.tandemcoaching.academy). If they cannot access their course materials, escalate to Alex or Cherie to check their enrollment access.

### Lesson 22: New taxonomy label: MrGru/notification/monitoring — classify Labrika as monitoring
**Problem:** Labrika (labrika.com) sends automated weekly SEO and site health audit reports for tandemcoach.co. These were previously classified as MrGru/vendor/cold and escalated, but Alex wants them classified as a monitoring report and surfaced in the daily digest without escalation.
**Rule:** A new taxonomy label has been approved: `MrGru/notification/monitoring` — Automated site health, SEO audit, uptime, or performance reports (hive: alex, priority 1). Classify all emails from Labrika (info@labrika.com or any @labrika.com sender) as `MrGru/notification/monitoring`. Do not escalate these. They will appear in the daily digest for Alex's review. Also use this label for other automated site/uptime monitoring services (e.g. UptimeRobot, Pingdom, Google Search Console alerts).

### Lesson 23: Lead with value, not price — price is the payoff, not the opener
**Problem:** Email drafts consistently led with program prices (e.g., "Our ACC program is $3,999..."). While Tandem's prices are competitive, leading with them positions the program as "the affordable option" and invites price-comparison thinking before the lead understands what they're getting.
**Rule:** Price must appear in every program response (transparency matters at this consideration level), but never in the opening sentence. Always establish at least one value prop specific to the lead's question before stating the price. Structure: answer their question → relevant value (ICF accreditation, MCC instructors, modular flexibility, included mentor coaching) → price as the payoff. The lead should read "all of that for $3,999" not "is $3,999 worth it?" Do not bury or hide price — just don't lead with it.
