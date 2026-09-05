# NC-20260904-003 — MCS Sertifier package draft

Status: provider package created and read back. No recipient, credential, or delivery is authorized by this file.

## Authority and invariants

- Program: `Mentor Coaching Specialization – Practicum`.
- Provider-facing certificate design already exists as `MCS Practicum`, ID `08df06dd-6b9b-471f-844f-157cf5d7021e`.
- The accredited program contains 71 total program hours: 41 participant contact hours and 30 asynchronous hours.
- Full graduation requires five observed mentor-coaching sessions, written feedback on at least three, five hours of mentoring-on-mentoring, the final assignment, and completion of all AAMC program requirements.
- ICF evaluation-tool training included in the accredited 71 hours is ACC Behaviorally Anchored Rating Scales (BARS) and PCC Markers. MCC BARS is a bonus outside the accredited 71 hours and must not appear in this credential.
- Tandem issues program-completion evidence. ICF separately reviews and awards the individual Mentor Coach Specialization.
- The full-graduation package may use the AAMC logo only for verified full graduates. The digital badge deliberately omits the ICF/AAMC logo and identifies a Tandem program graduate.
- The partial-completion package must not use the AAMC logo or imply graduation. It is private by default and has no badge.

## Package 1 — full MCS Practicum graduation

Preset: `mcs-practicum`

Send aliases:

- `mcs practicum`
- `mcs graduation`
- `mentor coaching practicum`
- `mentor coaching specialization practicum`

### Certificate design

- ID: `08df06dd-6b9b-471f-844f-157cf5d7021e`
- Title: `MCS Practicum`
- Required recipient attributes: none. Recipient name and graduation/issue date use Sertifier built-ins; the fixed certificate artwork states the 71/41-hour and evaluation-tool facts.

### Digital badge

- Title: `MCS Practicum Graduate`
- Asset: `/Users/xbohdpukc/.codex/visualizations/2026/08/29/01a04f94-d637-7922-af54-af42b9c986eb/graduation-templates/mcs-package/mcs-practicum-graduate-badge-final-clean-alpha-3000.png`
- Visible wording: `MENTOR COACHING / PRACTICUM / GRADUATE`.
- No ICF or AAMC logo and no claim that Tandem awards the individual MCS designation.

### Credential Detail

Title: `Mentor Coaching Specialization – Practicum`

Duration: 71 hours

Skill: `Mentor Coaching`

Description HTML:

```html
<p>This credential recognizes verified graduation from Mentor Coaching Specialization – Practicum, Tandem Coaching Academy’s 71-hour program accredited by the International Coaching Federation under the Advanced Accreditation in Mentor Coaching (AAMC).</p><p><br></p><p>The program comprises 41 participant contact hours and 30 asynchronous hours. The holder completed five observed mentor-coaching sessions, received written feedback on at least three, completed five hours of mentoring-on-mentoring and the final assignment, and fulfilled all AAMC program requirements.</p><p><br></p><p>The accredited program includes ICF evaluation-tool training in ACC Behaviorally Anchored Rating Scales (BARS) and PCC Markers. This credential documents Tandem program completion and supports the holder’s application to ICF; ICF separately reviews and awards the individual Mentor Coach Specialization.</p>
```

Earning Criteria HTML:

```html
<p>To earn this credential, the holder completed and was verified on every requirement of Tandem Coaching Academy’s ICF-accredited Mentor Coaching Specialization – Practicum.</p><p><br></p><ol><li>Completed all 71 program hours: 41 participant contact hours and 30 asynchronous hours.</li><li>Completed five observed mentor-coaching sessions and received written feedback on at least three.</li><li>Completed five hours of mentoring-on-mentoring.</li><li>Completed the final assignment.</li><li>Completed ICF evaluation-tool training in ACC Behaviorally Anchored Rating Scales (BARS) and PCC Markers.</li><li>Met all Advanced Accreditation in Mentor Coaching (AAMC) program requirements.</li></ol><p><br></p><p>The credential is released only after the program administrator verifies every requirement in the participant record.</p>
```

### Delivery email

Template title: `MCS Practicum Graduation`

Subject: `Your MCS Practicum Graduation Credential is Here`

Body:

```text
Hi [recipient.name],

Congratulations — you have graduated from Mentor Coaching Specialization – Practicum, Tandem Coaching Academy’s 71-hour program accredited by the International Coaching Federation under the Advanced Accreditation in Mentor Coaching (AAMC).

Your credential documents 71 total program hours, including 41 participant contact hours, and confirms completion of all AAMC program requirements. It also documents ICF evaluation-tool training in ACC Behaviorally Anchored Rating Scales (BARS) and PCC Markers.

This is the program-completion credential you can use to support your MCS application to ICF. ICF, not Tandem Coaching Academy, reviews and awards the individual Mentor Coach Specialization.

Use your verified credential link for your ICF application records and professional profile.

— Tandem Coaching Academy
```

### Canonical campaign

- Title: `Canonical | mcs-practicum | v1`
- Sender: `Tandem Coaching Academy <info@tandemcoach.co>`
- Subject: `Your MCS Practicum Graduation Credential is Here`
- Privacy: public (`false`)
- Allowed statuses: Draft (`1`) or Sent (`3`)
- Create empty; no recipient canary.

## Package 2 — MCS Practicum partial-completion companion

Preset: `mcs-practicum-partial`

Send aliases:

- `mcs practicum partial`
- `mcs partial completion`
- `mentor coaching practicum partial`
- `mentor coaching partial completion`

### Certificate design

- Title: `MCS Practicum Partial Completion`
- Background: `/Users/xbohdpukc/Library/CloudStorage/GoogleDrive-info@tandemcoaching.academy/My Drive/tandemcoaching.academy/400 Sales & Marketing/420 Brand/90 Asset Status Review/logos/Certificates/2026 Partial Completion Certificates/MCS/MCS Partial Completion Record - TEMPLATE v3 CONCISE - 11x8.5in 300dpi.png`
- No AAMC logo and no graduation language.
- Required attributes:
  - text: `Module or Class Completed` / `module-or-class-completed`;
  - number: `Participant Contact Hours Completed` / `participant-contact-hours-completed`;
  - date: `Date Hours Completed` / `date-hours-completed`.
- Recipient name uses the Sertifier built-in.

### Digital badge

None. A public achievement badge for partial completion would create avoidable confusion with full AAMC graduation.

### Credential Detail

Title: `Mentor Coaching Specialization – Practicum: Partial Completion Record`

Skill: `Mentor Coaching` (required by Sertifier to make the Detail selectable;
this remains a partial-completion record and does not assert graduation).

Description HTML:

```html
<p>This record documents verified partial completion of Tandem Coaching Academy’s Mentor Coaching Specialization – Practicum.</p><p><br></p><p>The record identifies the completed module or class, the participant contact hours completed, and the date those hours were completed. It does not certify graduation from the full Advanced Accreditation in Mentor Coaching (AAMC) program and does not carry the AAMC logo.</p>
```

Earning Criteria HTML:

```html
<p>This record is issued only after Tandem Coaching Academy verifies the participant’s completed module or class, participant contact hours, and completion date in the program record.</p><p><br></p><p>It documents partial completion only. It does not confirm completion of all AAMC requirements and is not evidence that the holder has graduated from the full Mentor Coaching Specialization – Practicum.</p>
```

### Delivery email

Template title: `MCS Practicum Partial Completion`

Subject: `Your MCS Practicum Partial Completion Record`

Body:

```text
Hi [recipient.name],

Your Mentor Coaching Specialization – Practicum partial completion record is ready.

It documents the verified module or class, participant contact hours, and completion date shown on the record. It does not certify graduation from the full program or completion of all AAMC requirements.

Keep the verified record for your files or provide it to another education provider if you are requesting recognition of the completed hours.

— Tandem Coaching Academy
```

### Canonical campaign

- Title: `Canonical | mcs-practicum-partial | v1`
- Sender: `Tandem Coaching Academy <info@tandemcoach.co>`
- Subject: `Your MCS Practicum Partial Completion Record`
- Privacy: private (`true`)
- Allowed statuses: Draft (`1`) or Sent (`3`)
- Create empty; no recipient canary.

## Issuance boundary

Package creation does not authorize a recipient issue. Full-graduation issuance still requires exact Heartbeat identity, zero prior matching credential or an explicit duplicate override, completion evidence, a durable pending script, review, and distinct send approval. Partial completion additionally requires all three custom attribute values and follows the same review/send boundary.
