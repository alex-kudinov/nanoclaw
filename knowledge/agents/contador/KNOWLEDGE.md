# El Contador — Knowledge Base

## Google Sheets Structure

Two SEPARATE Google Sheets (different sharing permissions):

### Sheet 1: "Tandem Payments" (PRIVATE — admin only)

Contains one tab:

#### Tab: "Payment Log"

Raw transaction log. One row per payment event.

Headers (A1:J1):
Date | Customer Name | Email | Product Name | Amount | Fee | Net | Currency | Stripe ID | Status

### Sheet 2: "Tandem Student Roster" (SHARED with contractor trainers)

Contains four tabs — three program rosters plus a product lookup table.

#### Tab 1: "ACC Roster"

ACC (Associate Certified Coach) students. One row per student.

Headers (A1:L1):
Email | Name | Full Program | M1 | M2 | M3 | M4 | Group Supervision | Group Mentoring | Individual Mentoring | Exam Prep | Refunded

#### Tab 2: "PCC Roster"

PCC (Professional Certified Coach) students. One row per student.

Headers (A1:M1):
Email | Name | Full Program | M1 | M2 | M3 | M4 | Group Supervision | Group Mentoring | Individual Mentoring | Exam Prep (Indiv) | Exam Prep (Team) | Refunded

#### Tab 3: "ACTC Roster"

ACTC (Advanced Certified Team Coach) students. One row per student.

Headers (A1:K1):
Email | Name | Full Program | M1 | M2 | M3 | M4 | Group Supervision | Recording Review | Test Prep | Refunded

#### All Roster Tabs

Row key: column A = Email. If buyer already exists, update their row. If not, append a new row.
Data cells contain the purchase date (YYYY-MM-DD). The Refunded column contains the refund date.
A student can appear in multiple tabs if they purchased from different programs.

#### Tab 4: "Product Map"

Lookup table mapping Stripe product names to the correct roster tab and column. The process-payment.cjs script reads this tab at runtime.

Headers (A1:C1):
Stripe Product Name | Roster Tab | Roster Column

Example rows:
ICF Level 1: Module 1 Coaching Fundamentals | ACC Roster | M1
Level 2: Module 4: System Awareness | PCC Roster | M4
Mastering the ICF ACTC Team Coaching Exam | ACTC Roster | Test Prep

Populate this tab with the actual product names from your Stripe Dashboard / Heartbeat. Add multiple name variants for the same column if needed — the script matches case-insensitively.

### Full Program Rule

When a "Full Program" product is purchased, mark ONLY the corresponding "Full Program" column.
Do NOT auto-fill individual component columns — components are marked only when purchased individually.

---

## Initial Product Map Data

Use these as starting entries in the Product Map tab. Verify against your actual Stripe product names and update as needed.

### ACC (Associate Certified Coach)

| Stripe Product Name | Roster Column |
|---|---|
| Full ACC Level 1 Program | ACC Full Program |
| ACC Full Program | ACC Full Program |
| ACC Module 1 | ACC M1 |
| ACC Module 1 – Coaching Fundamentals | ACC M1 |
| ACC Module 2 | ACC M2 |
| ACC Module 2 – Critical Coaching Skills | ACC M2 |
| ACC Module 3 | ACC M3 |
| ACC Module 3 – Coaching Client Mindset and Beliefs | ACC M3 |
| ACC Module 4 | ACC M4 |
| ACC Module 4 – Advanced Coaching Techniques | ACC M4 |
| ACC Group Supervision | ACC Group Supervision |
| Group Supervision (ACC) | ACC Group Supervision |
| ACC Group Mentoring | ACC Group Mentoring |
| Group Mentoring (ACC) | ACC Group Mentoring |
| ACC Individual Mentoring | ACC Individual Mentoring |
| Individual Mentoring (ACC) | ACC Individual Mentoring |
| ACC Exam Prep | ACC Exam Prep |
| ICF Exam Prep Course | ACC Exam Prep |
| ICF Coach Knowledge Assessment Prep | ACC Exam Prep |

### Professional Coach Program (ACC + PCC + ACTC Bundle)

| Stripe Product Name | Roster Column |
|---|---|
| Professional Coach Program | ACC Full Program |
| Professional Coach Program (ACC + PCC + ACTC) | ACC Full Program |
| Full Professional Coach Program | ACC Full Program |

**Note:** The Professional Coach Program ($7,499) bundles ACC + Systems Coach (PCC+ACTC). When purchased, mark the student's ACC Full Program column. As they progress through Phase 2, their PCC roster entries will be added separately when those components are activated/completed.

### PCC / Systems Coach Program (Professional Certified Coach)

| Stripe Product Name | Roster Column |
|---|---|
| Full PCC + ACTC Level 2 Program | PCC Full Program |
| PCC Full Program | PCC Full Program |
| PCC + ACTC Full Program | PCC Full Program |
| PCC Module 1 | PCC M1 |
| PCC Module 1 – System Coaching Mindset and Focus | PCC M1 |
| PCC Module 2 | PCC M2 |
| PCC Module 2 – Coaching Organizational and Team Systems | PCC M2 |
| PCC Module 3 | PCC M3 |
| PCC Module 3 – System Perception and Framing | PCC M3 |
| PCC Module 4 | PCC M4 |
| PCC Module 4 – System Awareness | PCC M4 |
| PCC Group Supervision | PCC Group Supervision |
| Group Supervision (PCC) | PCC Group Supervision |
| PCC Group Mentoring | PCC Group Mentoring |
| Group Mentoring (PCC) | PCC Group Mentoring |
| PCC Individual Mentoring | PCC Individual Mentoring |
| Individual Mentoring (PCC) | PCC Individual Mentoring |
| ICF Individual Coaching Exam Prep | PCC Exam Prep (Indiv) |
| PCC Exam Prep – Individual | PCC Exam Prep (Indiv) |
| ICF Team Coaching Exam Prep | PCC Exam Prep (Team) |
| PCC Exam Prep – Team | PCC Exam Prep (Team) |

### ACTC (Advanced Certified Team Coach)

| Stripe Product Name | Roster Column |
|---|---|
| Full ACTC Program | ACTC Full Program |
| ACTC Full Program | ACTC Full Program |
| ACTC Module 1 | ACTC M1 |
| ACTC Module 1 – Systems Coaching Foundation | ACTC M1 |
| ACTC Module 2 | ACTC M2 |
| ACTC Module 2 – Coaching Org and Team Systems | ACTC M2 |
| ACTC Module 3 | ACTC M3 |
| ACTC Module 3 – System Framing and Re-framing | ACTC M3 |
| ACTC Module 4 | ACTC M4 |
| ACTC Module 4 – Creating System Awareness | ACTC M4 |
| ACTC Group Supervision | ACTC Group Supervision |
| Group Supervision (ACTC) | ACTC Group Supervision |
| Recording Review | ACTC Recording Review |
| ACTC Recording Review | ACTC Recording Review |
| ICF Team Coaching Test Prep | ACTC Test Prep |
| ACTC Test Prep | ACTC Test Prep |

---

## Google Sheets Service Account Setup

One-time setup to enable El Contador to write to the sheet.

### Step 1 — Create a Google Cloud Project (or use existing)

1. Go to https://console.cloud.google.com/
2. Select or create a project (e.g., "Tandem NanoClaw")
3. APIs & Services → Library → Search "Google Sheets API" → Enable it

### Step 2 — Create a Service Account

1. APIs & Services → Credentials → Create Credentials → Service Account
2. Name: `nanoclaw-contador` → click Create
3. Skip role assignment → Done
4. Click the service account email → Keys tab → Add Key → Create new key → JSON → Create
5. A JSON file downloads — this is your credential file

### Step 3 — Deploy the Credential File

Copy to Mac Mini (Syncthing will handle the rest if on this machine):
```bash
mkdir -p ~/dev/NanoClaw/data/credentials
cp ~/Downloads/nanoclaw-contador-*.json \
  ~/dev/NanoClaw/data/credentials/sheets-service-account.json
```

The `data/` directory is gitignored. The container mounts this at `/workspace/extra/credentials/`.

### Step 4 — Create the Payments Sheet (private)

1. Create a new Google Sheet, name it "Tandem Payments"
2. Rename Tab 1 to `Payment Log` — add headers from Sheet 1 section above
3. Share with the service account email → Editor access
4. Do NOT share with trainers — this is financial data

### Step 5 — Create the Student Roster Sheet (shared)

1. Create a new Google Sheet, name it "Tandem Student Roster"
2. Rename Tab 1 to `Student Roster` — add headers from Sheet 2 / Tab 1 section above
3. Create Tab 2 `Product Map` — add headers and initial data from Sheet 2 / Tab 2 section above
4. Share with the service account email → Editor access
5. Share with contractor trainers → Viewer access (they can see roster but not edit)

### Step 6 — Set the Sheet IDs

The Sheet ID is the long string in each sheet's URL:
`https://docs.google.com/spreadsheets/d/THIS_IS_THE_SHEET_ID/edit`

Add both to `.env`:
```
SHEETS_PAYMENTS_ID=your_payments_sheet_id
SHEETS_ROSTER_ID=your_roster_sheet_id
```
