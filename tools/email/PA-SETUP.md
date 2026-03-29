# Power Automate — Email-to-Vault Flow Setup

Two flows: an **automatic** flow (triggers on emails copied to the Vault folder by Outlook rules) and a **manual** flow (test any email on demand).

**How it works:** Outlook server-side rules match emails by sender/subject/keywords and use "Copy to" to place a copy in a dedicated `Vault` folder. PA monitors that folder — when an email appears, it exports the metadata + body to OneDrive `Drop/Email/`, then deletes the copy from the Vault folder. No race condition: the email is already in the folder before PA sees it.

---

# Prerequisites

- Power Automate license (included with M365 E3/E5)
- OneDrive for Business with `Drop/Email/` folder created
- Outlook `Vault` folder created (see below)

### Create the Vault folder in Outlook

1. In Outlook (web or desktop), right-click **Inbox** → **New folder**
2. Name it `Vault`
3. This folder is the staging area — emails land here via rules, PA reads and deletes them

### Create the Drop/Email folder in OneDrive

1. Go to OneDrive for Business web → navigate to `Drop/`
2. Create a new folder called `Email`
3. This is where PA writes export files for the watcher to pick up

### Set up Outlook rules

Create **server-side** rules (not client-only) that copy matching emails to the Vault folder:

**Rule 1 — Key senders (always capture):**
- Condition: From = {your direct reports, key stakeholders}
- Action: **Copy to** → Vault folder

**Rule 2 — Project keywords:**
- Condition: Subject or body contains: CRM, PEPPOL, Billing Platform, etc.
- AND Condition: From = @solera.com (avoid external newsletters matching keywords)
- Action: **Copy to** → Vault folder

**Rule 3 — Action signals:**
- Condition: Subject contains: "action required", "follow up", "decision needed", "approval"
- AND Condition: From = @solera.com
- Action: **Copy to** → Vault folder

> **Important:** Use "Copy to" not "Move to" — the original stays in your Inbox. PA deletes only the copy from the Vault folder after processing.

---

## Flow 1: Automatic — "Email to Vault Export"

Uses **Export email** to save .eml files — zero expression complexity. The processor parses .eml natively.

### Step 1: Create the flow

1. Go to [make.powerautomate.com](https://make.powerautomate.com)
2. Click **+ Create** → **Scheduled cloud flow**
3. Flow name: `Email to Vault Export`
4. Repeat every: **5 minutes**
5. Click **Create**

### Step 2: Get emails from Vault folder

1. **+ New step** → search **"Get emails (V3)"** — Office 365 Outlook
2. Configure:

| Setting | Value |
|---------|-------|
| Folder | Vault |
| Top | 25 |
| Include Attachments | No |

> Include Attachments = No here because the Export email step gets the full .eml with attachments included as MIME parts.

### Step 3: Apply to each

1. **+ New step** → **Apply to each**
2. Select output: `value` from the Get emails step

### Step 4: Export email (inside Apply to each)

1. **+ New step** (inside the loop) → search **"Export email (V2)"** — Office 365 Outlook
2. Configure:

| Setting | Value |
|---------|-------|
| Message Id | `items('Apply_to_each')?['id']` (select **Id** from dynamic content) |

> Returns the full email as .eml binary content — headers, body, attachments, everything.

### Step 5: Create file (inside Apply to each)

1. **+ New step** → **Create file** — OneDrive for Business
2. Configure:

| Setting | Value |
|---------|-------|
| Folder Path | `/Drop/Email` |
| File Name | (expression below) |
| File Content | **Body** from the Export email step |

File Name expression:

```
concat(
  formatDateTime(items('Apply_to_each')?['receivedDateTime'], 'yyyyMMdd-HHmmss'),
  '-',
  replace(replace(
    take(items('Apply_to_each')?['subject'], 80),
    ' ', '-'),
    '/', '-'),
  '.eml'
)
```

> Note the `.eml` extension — the processor uses this to detect the format.

### Step 6: Create sidecar — Outlook deep link (inside Apply to each)

1. **+ New step** → **Create file** — OneDrive for Business
2. Configure:

| Setting | Value |
|---------|-------|
| Folder Path | `/Drop/Email` |
| File Name | Same expression as Step 5, but with `.json` instead of `.eml` |
| File Content | (expression below) |

File Name expression:

```
concat(
  formatDateTime(items('Each-Email')?['receivedDateTime'], 'yyyyMMdd-HHmmss'),
  '-',
  replace(replace(
    take(items('Each-Email')?['subject'], 80),
    ' ', '-'),
    '/', '-'),
  '.json'
)
```

File Content expression:

```
concat('{"web_link":"https://outlook.office365.com/owa/?ItemID=', encodeUriComponent(items('Each-Email')?['id']), '&exvsurl=1&viewmodel=ReadMessageItem"}')
```

> This creates a tiny companion file that the processor reads to inject an "Open in Outlook" link into the vault note. The `.json` sidecar is deleted after processing.

### Step 7: Delete email (inside Apply to each)

1. **+ New step** → **Delete email (V2)** — Office 365 Outlook
2. Configure:

| Setting | Value |
|---------|-------|
| Message Id | `items('Apply_to_each')?['id']` (select **Id** from dynamic content) |

> Deletes the copy from the Vault folder. The original in your Inbox is untouched.

### Step 7: Save and test

1. Click **Save**
2. Copy an email to the Vault folder (via Outlook rule or manually)
3. Click **Test** → **Manually** (or wait for the 5-minute schedule)
4. Verify:
   - [ ] .eml file appeared in OneDrive `Drop/Email/`
   - [ ] Email copy deleted from Vault folder
   - [ ] .eml file contains full headers and body when opened in a text editor

### What the processor gets from .eml

The .eml format provides richer data than the V3 trigger:

| Field | Source | Example |
|-------|--------|---------|
| From | `From:` header | `Mike Chandler <Michael.Chandler@Solera.com>` (with display name!) |
| To | `To:` header | `Alex Kudinov <Alex.Kudinov@solera.com>` (with display name!) |
| CC | `Cc:` header | Same format |
| Attachments | MIME parts | Filenames extracted from `Content-Disposition` headers |
| Thread ID | `References:` / `In-Reply-To:` headers | Standard RFC threading |

**Not available from .eml:** `webLink` (Outlook-specific deep link) and `conversationId` (Outlook-specific thread ID). Thread management uses standard `References` / `In-Reply-To` headers instead.

---

## Flow 2: Manual — "Export Email to Vault"

For testing: export any specific email on demand by subject search. Same Export email approach — zero expressions.

> **Simpler alternative:** Just copy an email to the Vault folder. Flow 1 picks it up on the next 5-minute cycle. Or click Test on Flow 1 to trigger immediately.

### Step 1: Create the flow

1. **+ Create** → **Instant cloud flow**
2. Flow name: `Export Email to Vault`
3. Trigger: **Manually trigger a flow**
4. Add an input: **Text** → label it `Email Subject Search`
5. Click **Create**

### Step 2: Get the email

1. **+ New step** → **Get emails (V3)** — Office 365 Outlook
2. Configure:

| Setting | Value |
|---------|-------|
| Folder | Inbox |
| Search Query | `subject:@{triggerBody()['text']}` |
| Top | 1 |
| Include Attachments | No |

### Step 3: Apply to each

1. **+ New step** → **Apply to each**
2. Select output: `value` from the Get emails step

### Step 4–6: Same as Flow 1

Inside the loop, add the same three steps:
1. **Export email (V2)** — Message Id: select **Id** from dynamic content
2. **Create file** — `/Drop/Email/` with the .eml filename expression and Export body
3. (No delete step — this is Inbox, not the Vault folder)

### Step 7: Save and test

1. Click **Save**
2. Click **Test** → **Manually**
3. Enter a subject keyword (e.g., "Billing Staffing")
4. The flow exports the matching email to `Drop/Email/` as .eml
5. Run the processor manually or wait for the watcher:
   ```bash
   cd ~/dev/NanoClaw/tools/email
   ../../.venv/bin/python3 process_email.py --vault-root ~/Vaults/"My Notes"
   ```

---

## Troubleshooting

### `from` is just an email address with no display name
This is normal for some senders (especially external). The processor resolves the email address against People notes to find the canonical name. Internal Outlook users may return `"Display Name <email>"`.

### `cc` expression fails
`ccRecipients` is absent (not null) when there's no CC. Use `coalesce(triggerOutputs()?['body/ccRecipients'], '')` to default to empty string.

### `attachment_names` is empty even though email has attachments
Verify the trigger has **Include Attachments = Yes**. With No, the `attachments` array is always empty.

### Select - Attachments action name mismatch
The `body('Select_-_Attachments')` reference must match the exact action name. If PA renamed it (e.g., `Select_-_Attachments_2`), update the reference in the Compose step.

### Email not deleted from Vault folder
- Check that the Delete email step uses **Message Id** from the trigger dynamic content
- PA needs Outlook permissions to delete — verify the connection has the right scope

### File not appearing in Drop/Email/
- Check the OneDrive Create file step output — look for errors in run history
- Verify the `/Drop/Email` folder exists in OneDrive
- Check PA run history: **My flows** → click the flow → **Run history**

### Watcher not picking up files
- OneDrive sync may take 1-5 minutes
- Check `~/.local/log/onedrive-watcher.log` for errors
- Manually trigger: `bash ~/dev/NanoClaw/scripts/onedrive-watcher.sh`

### Emails piling up in Vault folder
- The Delete step may be failing — check run history
- Safety net: create an Outlook rule to auto-delete Vault folder emails older than 7 days

---

## Architecture

```
Outlook Inbox
    │
    ├── Server-side rules (sender/keyword match)
    │       │
    │       └── "Copy to" → Vault folder
    │                           │
    │                           ├── PA trigger: "When new email arrives in Vault"
    │                           │       │
    │                           │       ├── Export @@EXPORT_META → OneDrive Drop/Email/
    │                           │       └── Delete copy from Vault folder
    │                           │
    │                           └── OneDrive sync → Mac Mini
    │                                   │
    │                                   └── onedrive-watcher.sh
    │                                           │
    │                                           └── process_email.py → Vault note
    │
    └── Original email stays in Inbox (untouched)
```
