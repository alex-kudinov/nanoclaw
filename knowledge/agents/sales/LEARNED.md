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

### Lesson 24: Untitled
**Problem:** Mentor Coaching Foundations — lead asked when CCE accreditation would be confirmed
**Rule:** When explaining CCE accreditation status, do not say CCEs are 'valid from submission' in a way that implies the student can use them immediately. The correct framing: ICF takes a few weeks to review; once approved, CCEs are awarded retroactively to all students who enrolled on or after the submission date — but they cannot be recognized/used until ICF formally approves. The initial draft incorrectly implied credits apply upon course completion.

### Lesson 25: Untitled
**Problem:** Mentor Coaching Foundations (MCS/CPL path) — lead asked if course runs on Moodle and is Mac-compatible; ready to enroll
**Rule:** When a lead asks about the platform/technical requirements, a brief reassurance plus a concrete preview path improves the response. Initial draft correctly addressed the Mac/platform question but missed the opportunity to offer the free 'Master 2025 ICF Coaching Competencies' course (https://community.tandemcoaching.academy/invitation?code=57B472) as a no-commitment way to experience the platform, and the trial lessons available on the Foundations course page. Future responses to platform/access questions should proactively offer both the free preview course and trial lessons alongside the direct enrollment link.

### Lesson 26: Untitled
**Problem:** MCS/CPL path — lead (Suyin Ong) was PCC going through MCC training, asking whether Tandem provides opportunities to fulfill the 5-mentee requirement
**Rule:** ICF has renamed the Mentor Coach Qualification (MCQ) to Mentor Coach Specialization (MCS). Use MCS in all email drafts and program references going forward. "Formerly MCQ" can be added once parenthetically when first referenced, for leads who learned the old name. KB on disk has been updated as of 2026-05-09 — pricing, paths, and program names in KNOWLEDGE.md are canonical.

### Lesson 27: Untitled
**Problem:** Administrative inquiry asking for Tandem's ICF accreditation number — no program match, verification/trust-building request
**Rule:** Initial draft assumed ICF issues numeric accreditation numbers and left a placeholder for one. ICF does not issue accreditation numbers — programs are accredited as Level 1 or Level 2 and listed publicly on the ICF website. The correct response directs the lead to search the ICF program directory at coachingfederation.org.

### Lesson 28: Untitled
**Problem:** MCS Practicum waitlist lead (Joel Dietz) asking whether cohort is self-contained or requires self-sourced mentees
**Rule:** When answering a lead's specific question, answer only that question. Don't add logistical context (e.g., 'you're already set for Cohort B') or forward-looking notes (e.g., 'full details being finalized') that weren't asked about. Alex flagged both as unnecessary — keep it short and on point to the answer.

### Lesson 29: For 'does my prior training count
**Problem:** Claudia Smargiasso — prior coaching training (Academy of Coaching and Counselling), asking if she can skip phases of the Professional Coach Program
**Rule:** For 'does my prior training count?' questions: ask only if studies are ICF-accredited + have CCEUs, then explain the 'if not' path (portfolio paperwork or start from scratch). Do NOT speculate about what happens if they ARE accredited — that requires further evaluation and Alex flagged the assumption as incorrect. Just ask the question and explain the fallback.

### Lesson 30: Untitled
**Problem:** MCS Practicum — Kate Fullbrook asked about future cohort frequency and whether schedule would repeat
**Rule:** When a lead asks how often the MCS Practicum will run and whether days/times will be the same: future cohorts pull from the waitlist as enough students form, sessions will run at similar day and evening options (US time zones) but not necessarily the same day of the week, and waitlist members get first access to register.

### Lesson 31: Untitled
**Problem:** ACC — lead asking about missing sessions and whether async makeup is possible
**Rule:** When leads ask whether they can make up missed ACC live sessions asynchronously: no — ICF requires a specific sync/async ratio, and live sessions count toward that. Missed live sessions can only be completed by attending the same session in a future cohort (live). Guide leads to choose a cohort schedule they can commit to. Never imply async content can substitute for missed live classes.

### Lesson 32: Untitled
**Problem:** ACC — lead asking about missing sessions and async makeup options
**Rule:** When leads ask about missing ACC live sessions: (1) live sessions cannot be substituted with async content — ICF requires a specific sync/async ratio; (2) missed sessions must be attended live in a future cohort; (3) guide leads to choose a cohort schedule they can commit to, noting the pause-between-modules option. Also: when the lead's question is purely about scheduling logistics (not pricing), drop the pricing — Alex approved this email without the price line.

### Lesson 33: Untitled
**Problem:** ACC — lead with scheduling constraints asking whether she could start Module 2 with incomplete Module 1 sessions
**Rule:** Students CAN continue to the next ACC module even with outstanding sessions from a previous module — they simply come back and attend the missed live sessions when that module runs again (classes are staggered and overlap). Makeup must be done live, not via recordings (ICF async hour limits). The 'pause between modules' rule applies to intentional breaks, not to this makeup pattern. Do not tell leads they must complete a module before starting the next.

### Lesson 34: Untitled
**Problem:** Cara Fuccillo booking follow-up — Alex flagged this as unnecessary
**Rule:** Booking handoffs ([HANDOFF: booking→sales]) do NOT require a pre-session email or follow-up. Trafft handles booking confirmations automatically. When a booking handoff arrives, create/update the pipeline entry and log context, but do not draft or send any email to the lead. Alex confirmed this explicitly on 2026-05-13.
**Status (2026-05-15):** Now enforced STRUCTURALLY — the `booking→sales` handoff was removed entirely. Trafft `booked` webhooks are handled mechanically host-side (party + interaction row written by `bookingHostWrite`); the booking agent no longer hands off to sales, so this lesson can no longer be violated.

### Lesson 35: Untitled
**Problem:** Professional Coach Program (ACC+PCC+ACTC); lead asked multi-part questions about Phase 1 structure, mentor coaching hours, performance evaluation, 500h timeline, education validity, 2027 schedule, and price increases
**Rule:** When a multi-question reply touches program structure, first ask the strategic clarifying question that drives all other answers — in this case, 'do you want ACC as an interim credential or go straight to PCC?' — because the answer determines whether Phase 1 mentor coaching components are required at all. Also: when ICF requirements are actively changing (e.g. mentor coaching 2026-2027), flag the uncertainty rather than stating rules confidently. Never predict 2027 pricing; be honest that we can't forecast it.

### Lesson 36: Untitled
**Problem:** MCS Practicum / Mentor Coach Training — lead couldn't do July inaugural cohort, asked about September start
**Rule:** When a lead asks about cohort availability and the requested window doesn't match published dates, hold the response and confirm with Cherie/Alex before replying — new cohort dates may exist but not yet be in the KB. In this case, the lead asked about September and Cherie had Q4 cohort dates ready within minutes.

### Lesson 37: Untitled
**Problem:** Mentor Coaching Foundations customer (HY) asking how to access the course after purchase. Conversion/onboarding case.
**Rule:** Initial draft assumed login credentials were emailed post-purchase and told the lead to check their spam folder. The correct approach for Mentor Coaching Foundations (community.tandemcoaching.academy) is to direct the lead to log in directly with their purchase email address — no separate credential email is sent. Always confirm platform access flow with Alex/Cherie rather than assuming a credential-email onboarding model.

### Lesson 38: Untitled
**Problem:** Systems Coach Program (PCC track) — ACC-level coach asking about prior training eligibility, module-by-module purchase, certificates per module, and deferring Phase 3.
**Rule:** When a lead asks specific, bounded questions and clearly knows what they want (modules only, not full program), answer those questions directly without redirecting to the full program or quoting full price. Also: the Systems Coach Program is ICF Level 2 accredited so per-module certificates are not issued — instead, a letter of completion can be provided for reimbursement purposes. Prior ICF Level 1 training qualifies for entry but requires a graduation certificate at enrollment.

### Lesson 39: Untitled
**Problem:** MCS Practicum — lead had a June 5 board retreat conflict with Cohort A orientation; asked about payment plan
**Rule:** For MCS Practicum leads with an orientation date conflict, do not suggest switching cohorts — orientation attendance is flexible and either date works regardless of cohort. What matters is the lead's ability to commit to all class sessions in their chosen cohort. Also: MCS Practicum payment plan is 2 installments (one at signup, one a month later). Do not include enrollment deadlines in the draft body without explicit confirmation that Alex/Cherie want that pressure applied.

### Lesson 40: Untitled
**Problem:** Mentor Coach Training (MCS Standard Path, $1,997 founding); MCC-track coach based in Malaysia who had already completed PCC Markers and was pursuing MCC credential independently
**Rule:** When a lead asks about 'the exam for MCC' in the context of MCS evaluation training, they may be asking about their separate MCC credential path — not the MCS program itself. The correct answer: there is no separate MCC-level exam; MCC BARS follows the same structure and content as PCC Markers, so prior PCC Markers work transfers. Also, when a lead asks how MCS differs from 'Supervision training,' they may be referring to the ICF Coaching Supervision Specialization (a separate credential ICF has announced but not yet detailed) — not Tandem's standalone supervision service. Answer: the two are completely separate tracks; ICF has not yet released specifics, timelines, or application process for the Coaching Supervision Specialization.

### Lesson 41: Untitled
**Problem:** ACC Level 1 inquiry (Michele Meek, Entry 110) — lead asked about ICF training path and timeline
**Rule:** Initial draft quoted incorrect class details for the June 3 ACC cohort — Cherie corrected: June 3 is a Wednesday and classes run 6–8 PM Central time, with no second Level 1 cohort before September. Always verify ACC cohort day-of-week and exact session time from confirmed sources before quoting; memory note added 2026-05-18.

### Lesson 42: Untitled
**Problem:** Generic ICF training inquiry; ACC program, Level 1; lead's timezone unknown
**Rule:** Before quoting any ACC cohort date, always verify the day of week and exact time — not just the calendar date. The June 3 cohort was quoted as 'Thursdays at 7 PM ET' when it is actually Wednesday, 6–8 PM CT. The US & Asia-Pacific and US & Europe tracks have different dates AND different times; they cannot be described as concurrent options for the same date. Always check day-of-week from the confirmed schedule (Cherie/Alex) before sending.

### Lesson 43: Untitled
**Problem:** MCS CPL path inquiry; experienced mentor coach with PCC credential, MCC application submitted, 5+ years as mentor coach faculty
**Rule:** MCS credentials are strictly per-level: MCS-PCC does NOT cover mentoring ACC candidates — that requires MCS-ACC separately. For a coach wanting to mentor at both levels, they need both ACC BARS (for MCS-ACC) and PCC Markers (for MCS-PCC). These are obtained from ICF directly — Tandem's standalone Evaluation Training courses are retired (see Lessons 65-66). Do not describe MCS-PCC as covering ACC candidates even when citing the KB 'safe harbor' language.

### Lesson 44: Untitled
**Problem:** Mentor Coaching — active client Thamer Alessa confirming July 7 cohort enrollment
**Rule:** Initial confirmation draft covered cohort enrollment but missed a pending onboarding step (community invite). Alex added: 'you were sent an invite to join our community separately — when you join we will add you to the appropriate groups.' When confirming enrollment for an active client, check whether there are parallel onboarding actions in progress (community invites, group assignments) and include them in the confirmation email so the client has a complete picture.

### Lesson 45: Untitled
**Problem:** Mentor Coach Training (MCS) — lead asking whether $1,997 founding cohort price was still available and how to reserve a seat for the July 2 Thursday cohort
**Rule:** Initial draft deferred the founding price availability question to the enrollment page instead of answering it directly. It also omitted the waitlist-vs-secured-seat distinction and skipped the cancellation/refund policy question. For enrollment inquiries: (1) answer availability questions directly upfront, (2) clarify that joining the waitlist reserves a spot but seat is only secured with registration + payment, and (3) acknowledge any outstanding policy questions with a note that details will follow by email.

### Lesson 46: Untitled
**Problem:** Mentor Coach Training (MCS Standard Path) — lead from France with PCC + 2,000 hours reported her waitlist signup failed; initial draft sent her back to the program page.
**Rule:** When a lead reports a failed form submission, check the DB first to confirm whether they are in the system before drafting. The initial draft redirected Isabelle to enroll at the program page — the same action she had already tried unsuccessfully. Cherie caught this as frustrating UX. The correct approach: verify in DB, confirm the gap, then resolve it on the lead's behalf (manual add by staff) and tell them it's done rather than asking them to retry.

### Lesson 47: Untitled
**Problem:** MCS Practicum Cohort B — lead could not find registration invite email, asked for resend
**Rule:** When a lead reports not receiving a registration invite, do not draft a holding response saying 'we've resent it' — instead, provide the direct registration link. The correct resolution was to share the invitation URL (community.tandemcoaching.academy/invitation?code=...) so the lead can self-register immediately without depending on an invite email.

### Lesson 48: Untitled
**Problem:** Portfolio Pathway to ACC lead asking which module and whether mentor coaching would help fill CCE hours; had EQi and Strengths certifications
**Rule:** For Portfolio Pathway leads asking about CCE hours, group mentor coaching ($699, on the Level 1/ACC program page) is the primary recommendation — it provides live feedback directly applicable to portfolio prep (8 CCE). Module 1 (Coaching Fundamentals, $399, 15 CCE) is the secondary option because it covers the ICF competencies portfolio applicants most often struggle with in recordings. Do not lead with module recommendations based on the lead's existing certifications (EQi, Strengths, group coaching) — those credentials are irrelevant to Portfolio Pathway program selection. Group mentor coaching standalone is $699 on the ACC page, not $1,499 (that is the full mentor coaching package including individual sessions).

### Lesson 49: Untitled
**Problem:** Portfolio Pathway ACC lead (Lourdes Laguna, Lead #204) with Strengths, EQi, and group coaching certifications asking which module to take and about CCE hours.
**Rule:** For Portfolio Pathway ACC leads asking about CCE hours: primary recommendation is group mentor coaching ($699, 8 synchronous CC hours, on the ACC Level 1 page — NOT the $1,499 full mentor coaching package). Secondary is Module 1 Coaching Fundamentals ($399, 15 CC hours), because it covers what portfolio applicants most often fail in recordings. Do NOT match module recommendations to the lead's existing certifications (EQi, Strengths, etc.) — those are irrelevant to Portfolio Pathway needs. Confirmed by Cherie 2026-05-23.

### Lesson 50: Untitled
**Problem:** Portfolio Pathway / CCE renewal lead asking about group mentor coaching hours and Module 1 CC breakdown; needed both mentor coaching hours and CCE renewal credits
**Rule:** Initial draft presented $699 standalone group mentor coaching for a lead asking about mentor coaching hours. Reviewer corrected: when a lead needs the full ICF mentor coaching requirement (10+ hours), present the full $1,499 package (8 group + 3 individual = 11 hours), not the standalone group option. Also flagged: mentor coaching hours and CCE renewal hours are separate categories — the same hours cannot count toward both requirements. Always clarify this distinction when a lead appears to be conflating MC hours with CCE renewal credits.

### Lesson 51: When a lead has a substantial conflict during orientation (e
**Problem:** MCS Mentor Coach Training prospect (Suyin Ong, Lead #89) on a cruise June 1–6, asked about orientation timing and duration.
**Rule:** When a lead has a substantial conflict during orientation (e.g., a cruise with uncertain wifi), include exact orientation dates AND the September cohort fallback option proactively in the draft. Also confirmed: orientation dates for Q3 are Wednesday June 4 at 5 PM CDT (US track) and Thursday June 5 at 9 AM CDT (Europe/Friday track). Always include these dates when any orientation conflict arises.

### Lesson 52: Untitled
**Problem:** MCS Mentor Coach Training prospect (Suyin Ong, Lead #89) on a cruise June 1–6, asked about orientation timing and duration.
**Rule:** Q3 Mentor Coach Training orientation dates (confirmed Alex 2026-05-24): Thursday June 4 at 5 PM CDT (US/Thursday track) and Friday June 5 at 9 AM CDT (Europe/Friday track), one hour each. When a lead has a substantial conflict during orientation (e.g., a cruise with uncertain wifi), include exact orientation dates AND the September cohort fallback option proactively. For scheduling-only reply emails to existing prospects, omit pricing — focus on the question (Alex: 2026-05-24).

### Lesson 53: Untitled
**Problem:** Mentor Coach Training — MCS CPL path vs Standard Path; lead is PCC/CEC asking which program to take
**Rule:** When a lead's question is about which path/program fits their situation, don't open the email with cohort dates or scheduling context — open directly with the path comparison framing. Cherie requested replacing the orientation/cohort date opener with 'it sounds like you'd like to know which program best fits your situation — here are the options.' The scheduling info was irrelevant to the question being answered.

### Lesson 54: For pure scheduling/logistics questions (e
**Problem:** Mentor Coach Training (MCS Standard Path) — lead asked whether missing Friday orientation disqualifies her from Q3 cohort
**Rule:** For pure scheduling/logistics questions (e.g., 'can I still join if I miss X?'), answer only the narrow question asked. The initial draft included pricing and live cohort session dates — Cherie stripped both, leaving only the answer to the scheduling question. Do not volunteer pricing or session schedules when the lead is asking a yes/no or how-to logistics question.

### Lesson 55: Untitled
**Problem:** MCS Foundations paying customer (Ken Kelling) hadn't received access email after enrollment. Support issue, not a sales inquiry.
**Rule:** Initial draft for a portal access issue used a 'team will be in touch' holding response. Reviewer provided the actual self-service resolution: go to community.tandemcoaching.academy for a login link, then find the course in the left sidebar. For MCS Foundations access issues, this is the standard resolution — draft it directly rather than deferring to a holding response.

### Lesson 56: Untitled
**Problem:** Mentor Coach Training enrollment assistance — lead could not join waitlist from website
**Rule:** Initial draft for Jeanette Jordan assumed the July (inaugural) cohort and only asked about track timing (Thursday vs Friday). Alex flagged that we first need to know whether she wants July or September. Correct approach: when a lead asks for enrollment help without specifying a cohort, present all upcoming cohort options (July and September, with their respective track timings) so the lead can choose — never assume the nearest cohort.

### Lesson 57: Untitled
**Problem:** ACC Renewal Mentor Coaching — lead asked about makeup options for missed group sessions and whether recorded sessions are available
**Rule:** When a lead asks about group session makeup policy for mentor coaching, the answer is: missed sessions can be made up with another group in a future cohort; recordings are not an option since ICF requires live hours. Initial draft deferred this pending confirmation — it is now a known policy that can be stated directly in future drafts.

### Lesson 58: Untitled
**Problem:** Mentor Coaching (ACC renewal), lead asked how to enroll for the July 7 cohort
**Rule:** Initial draft proactively offered the payment plan ($500/month x 3) in an enrollment reply. Reviewer (Alex) removed it and noted payment plan should only be offered when the lead explicitly asks — it is not a default option and offering it unprompted adds noise.

### Lesson 59: Untitled
**Problem:** ACC Renewal Mentor Coaching inquiry — lead confirmed intent to enroll and asked how to proceed with booking and payment
**Rule:** Initial draft for enrollment reply proactively offered the payment plan ($500/mo x 3). Alex removed it: the payment plan is not a default offering and should only be mentioned if the lead asks. In a ready-to-enroll reply, direct to the program page only — no payment plan mention.

### Lesson 60: Untitled
**Problem:** Mentor Coach Training (Friday track) — lead confirmed enrollment and best session time; welcome/orientation email.
**Rule:** On conversion welcome emails, include the community login prompt (community.tandemcoaching.academy) so new students can access course content immediately. The initial draft omitted this onboarding step; reviewer added it before approving.

### Lesson 61: Untitled
**Problem:** MCS / Mentor Coaching Foundations ($299, CPL path, self-paced) — experienced mentor coach with ACC, PCC, MCC mentoring background asking about cost and self-paced options.
**Rule:** Initial draft included a comparison paragraph explaining that the 41-hour Mentor Coach Training cohort is live/synchronous (not self-paced) to distinguish it from Foundations. For a CPL-path lead, this paragraph is irrelevant and adds noise — the Standard Path program (and its practicum) should not appear at all in a CPL-focused response. Remove any mention of the Standard Path cohort when the lead is confirmed on CPL path.

### Lesson 62: Untitled
**Problem:** Mentor Coaching Foundations (CPL path) — lead asked if course is ready to start immediately on enrollment
**Rule:** Draft incorrectly stated that Mentor Coaching Foundations ICF CCE accreditation was pending and included a caveat that the certificate would be issued after approval. In fact, the accreditation was already granted. Correct approach: state the course is live, enrollment gives immediate access, and the ICF CCE certificate is issued upon completion — no caveats.

### Lesson 63: Untitled
**Problem:** Enrolled MCS student (Mentor Coach Training) requesting to attend Friday orientation (June 5, 9 AM) instead of Thursday (June 4, 5 PM) due to family emergency travel.
**Rule:** Initial draft said 'We'll update your cohort assignment on our end' for an orientation-only track switch. Alex removed it: switching which orientation a student attends does not constitute a cohort assignment change and implies internal admin work that isn't happening. For orientation-only accommodations, simply confirm the new session details without referencing any backend updates.

### Lesson 64: Untitled
**Problem:** ADHD Executive Coaching follow-up #2; lead had already booked a consultation call in May with no further response
**Rule:** Follow-up emails for executive/custom-priced programs should not quote investment ranges. The initial draft included 'investment ranges from $15K–$50K+ depending on scope' in a follow-up nudge, but Alex removed it. Follow-ups add new value and invite re-engagement; pricing belongs in the initial proposal or when the lead asks, not in a brief follow-up.

### Lesson 65: Evaluation Training products discontinued — cannot be sold separately per ICF
**Problem:** Evaluation Training courses (ACC BARS $49, PCC Markers $99, MCC BARS $49, Complete Bundle $149) were listed as purchasable standalone products. Per latest ICF guidance, these evaluation trainings cannot be sold separately. The products have been taken down from the site.
**Rule:** Do NOT offer, quote, or reference Evaluation Training as a standalone purchasable product. These courses have been removed from the Tandem catalog per ICF guidance — they cannot be sold separately. Remove all references to Evaluation Training pricing ($49–$149) from any sales drafts. If a prospect asks about BARS or Markers training, do not promise availability or pricing — inform chief for current guidance on what can be offered.
**Context:** Alex Kudinov confirmed June 3, 2026: per latest ICF explanation, evaluation trainings cannot be sold separately and have been taken down.

### Lesson 66: All Evaluation Training products discontinued — embedded in MCS Standard Path only, cannot be sold separately
**Problem:** All Evaluation Training courses (ACC BARS $49, PCC Markers $99, MCC BARS $49, Complete Bundle $149) were listed as purchasable standalone products. Per ICF guidance, these cannot be sold separately. All products have been taken down from the site.
**Rule:** Do NOT offer, quote, or reference Evaluation Training as a standalone purchasable product. All eval training (ACC BARS, PCC Markers, MCC BARS, Complete Bundle) has been removed from the catalog per ICF guidance — they cannot be sold outside of the MCS Standard Path. These are now embedded in Mentor Coach Training (MCS Standard Path cohort) only. Remove all Evaluation Training pricing ($49–$149) from any sales drafts. If a prospect asks specifically about BARS or Markers training as a standalone purchase, inform them these are no longer available separately — they are included in the full MCS Standard Path program ($1,997 founding / $2,497 list).
**Context:** Alex Kudinov confirmed June 3, 2026: all eval training taken down, cannot be sold outside of MCS Standard Path.

### Lesson 67: Untitled
**Problem:** Hajnalka Segal — MCS qualification at both PCC and MCC levels; asked what training covers both
**Rule:** Initial draft described Tandem's Mentor Coach Training as a '41-hour Standard Path' with 'PCC Markers embedded' and 'MCC BARS as self-paced bonus.' Cherie corrected: Tandem is doing the AMCS-aligned practicum, not the 41-hour MCS Standard Path, and BARS/Markers training (ACC, PCC, MCC) must come from ICF directly — not from Tandem's program or described as embedded. Correct framing: two paths (CPL for experienced mentors, practicum for others), with BARS/Markers as a separate ICF requirement entirely.

### Lesson 68: Untitled
**Problem:** Mentor Coach Training (Standard Path), $1,698 net (list $1,997 minus $299 Foundations credit). Lead asked to split payment due to MacBook crash / solopreneur cash flow.
**Rule:** When a lead requests a split payment and the standard $500x3 plan doesn't align with the agreed net price, do not propose a flat 3-equal-installment split. Instead, flag the mismatch and ask for guidance before drafting. Alex's preferred structure for Deborah's $1,698 was two unequal installments: $699 today and $999 one month later — not three equal payments.

### Lesson 69: Untitled
**Problem:** Justin Speaks, existing student paying Invoice TCA-358-PL for Mentor Coach Training (MCS Standard Path, Inaugural Cohort A) at $1,997.
**Rule:** Initial draft for a payment-help email said 'the invoice should include a payment link' — too vague. Alex had a direct payment link and wanted it included verbatim with step-by-step instructions (Pay Now button → credit card → p-card). Always ask for or surface the specific payment link when available rather than directing the lead to find it themselves. Secondary lesson: cut 'You'll hear from us once that's confirmed' from closure lines — creates an expectation of a follow-up that may not happen.

### Lesson 70: Untitled
**Problem:** Mentor Coach Specialization inquiry (MCS) — ACC-credentialed internal coach at pharma; unclear whether corporate mentorship qualified as ICF credential-specific; two-path response (Standard Path $1,997 / CPL $299)
**Rule:** Initial draft for an MCS-path inquiry omitted the option to book a consult with Cherie. Alex added it back via feedback. For MCS / mentor coach specialization inquiries — where path selection (Standard vs CPL) requires nuanced assessment — always include the Cherie direct booking link alongside the written path guidance.

### Lesson 71: Untitled
**Problem:** ACC Level 1 inquiry — new prospect, no prior coaching background indicated, expressed intent to enroll in Level 1
**Rule:** When a lead asks about ACC (Level 1) and no prior credential pathway is mentioned, proactively mention the Professional Coach Program (ACC + PCC + ACTC, $7,499) as an option for those thinking about going all the way to PCC — same start dates, saves $499 vs buying separately. Alex added this via feedback on the Saba Khalid case. Don't wait for the lead to ask about PCC; surface it as a brief note at the end of the ACC response.

### Lesson 72: Untitled
**Problem:** Portfolio path ACC inquiry — lead wanted to know which Tandem modules to purchase; initial draft recommended Group Mentor Coaching + Module 1 without first understanding his existing CCE hours or mentor coaching status
**Rule:** For portfolio path ACC inquiries, do not jump straight to module recommendations. First ask what the lead already has in their portfolio — CCE hours, mentor coaching progress, existing credentials — so recommendations are gap-specific rather than generic. Alex corrected a draft that recommended specific modules without understanding the lead's existing training.

### Lesson 73: Duplicate handoff prevention — deduplicate before emitting [HANDOFF: sales→mailman]
**Problem:** On 2026-06-08, sales emitted an identical [HANDOFF: sales→mailman] for Entry #363 / Party #10423 twice — same Entry ID, Party ID, recipient, and body — at 12:05 UTC and again at 15:51 UTC. Chief blocked the second send, but the duplicate handoff should never have been emitted. A lesson was already routed on 2026-06-02 about checking the timeline before re-queuing the same Thread-ID; the duplicate recurred anyway, so the rule needs to be stronger.
**Rule:** Before emitting any [HANDOFF: sales→mailman], query the party's interaction timeline (business_v2.v_party_timeline WHERE party_id = <id> ORDER BY occurred_at DESC) and confirm no outbound email with the same subject or to the same recipient has been logged in the last 24 hours. If an identical or near-identical outbound interaction already exists for this party and thread, suppress the handoff entirely — do NOT re-emit it. Log a one-line [DUPLICATE-SUPPRESSED] note instead so chief can audit. This check is mandatory for every handoff, regardless of trigger source.

### Lesson 74: Untitled
**Problem:** MCS inquiry — lead asked about a BARS/Markers bundle with Foundations. CPL vs Standard path explained in email.
**Rule:** Initial draft included the Cherie direct booking link per the MCS ambiguity rule (path unclear). Alex removed it — the email explanation of CPL vs Standard path was sufficient and self-contained. Reserve the Cherie consult link for cases where path ambiguity cannot be resolved in writing (complex background, multiple credentials, entangled history), not merely because two paths exist.

### Lesson 75: Untitled
**Problem:** New aspiring coach (Noah Rice) asking to 'become a life coach' — said 'I would love to talk with someone.' Initial draft omitted Cherie link per no-consultation rule; Alex added it back.
**Rule:** When a lead explicitly says they want to 'talk with someone' or requests human contact, include Cherie's direct booking link even for standard program inquiries. The general 'no consultation calls' rule applies to unsolicited suggestions; when the lead directly asks for a conversation, honor that by offering the booking link.

### Lesson 76: Untitled
**Problem:** Mentor Coaching Foundations ($299), CPL path — lead asked about MCS mentor documentation criteria, ICF application process, and what the 6 written submissions entail
**Rule:** MCS CPL documentation criteria depend on HOW the coach mentored: if through a school/program, the school writes a letter and mentees do not need to have achieved ICF credentials; if independently, mentees must have achieved ICF credentials after mentorship, and ACC renewal hours do not count. Initial draft incorrectly applied the independent-path rule to all cases. Also, Mentor Coaching Foundations graded assessments are a mix of quizzes and written assignments per module — not all instructor-graded written assignments. Avoid detailed module-by-module breakdowns when a summary suffices.

### Lesson 77: Untitled
**Problem:** Systems Coach Program (PCC) inquiry; lead had ACC and was asking when the next Module 1 starts because August conflicted with her schedule.
**Rule:** For the Systems Coach Program (PCC/ACTC), modules are drop-in and can be taken in any order — students are not required to start at Module 1 or follow a sequential path. When a lead asks about a specific module start date, clarify this flexibility. Additionally, never offer to personally notify a lead when new cohort dates are available — dates are published to the program page; direct leads there instead.

### Lesson 78: Untitled
**Problem:** Active student (Liz Dobbins, Module 4 Mentor Coach Training) reporting login issue via form submission.
**Rule:** Initial draft for a login support request asked the student what email they used to register — an overly cautious response that assumed the issue was an unknown email. The correct approach: check the account first (party lookup confirmed liz@propelogy.com is in good standing), then provide the actual solution — direct the student to community.tandemcoaching.academy, enter their email, and use the magic link login email. Never ask for information already known from the handoff.

### Lesson 79: Untitled
**Problem:** Existing student (Liz Dobbins) unable to access Module 4 Assignment Part 2 in community.tandemcoaching.academy — technical support reply, not a new sales inquiry.
**Rule:** Initial draft for a community access/login issue separated the magic link step and the troubleshooting questions into two alternative paths. Reviewer wanted both combined in one email: lead with the actionable fix (magic link) first, then ask for details only if the fix doesn't work. This keeps the email action-oriented while still collecting diagnostic info if needed.

### Lesson 80: Untitled
**Problem:** Community platform login support — lead could not log in because email was entered with capital L (Liz@) instead of all-lowercase (liz@propelogy.com)
**Rule:** Initial draft did not account for the case sensitivity of the community platform login. The lead reported 'No results for Liz@propelogy.com' — the issue was that she used a capital L. The correct approach is to identify the exact casing error and tell the lead to use all-lowercase when the platform login is case-sensitive.
