# Gmail Cutover — Retire `info@tandemcoaching.academy` Forwarding

**Status:** Draft — pending 48h soak completion.
**Owner:** xbohdpukc.
**Depends on:** T23 (E2E smoke test — verified 2026-04-10, hive_synced end-to-end).
**Related plan:** `~/.claude/plans/nanoclaw/active/2026-04-09-bidirectional-gmail-classification.md` (T24 → T25).

---

## Purpose

Retire the legacy "forward info@ to every human" fan-out in favor of NanoClaw's bidirectional Gmail classification pipeline. Post-cutover, mail hitting `info@tandemcoaching.academy` gets classified by mailman, labeled in Gmail (`MrGru/...`), and (for labels with a `hive_share_target`) assigned inside Hive's `conversations/{threadId}` doc with the correct recipient.

## Current State (captured 2026-04-10)

Snapshot file: [`setup/gmail/pre-cutover-filter.json`](pre-cutover-filter.json). Captured via `scripts/apply-gmail-filter.ts --export`. Two independent forwarding paths exist — **both must be disabled at cutover**:

### Path 1 — Gmail Filter (`ANe1Bmi…oniStxKipaIerqd4cka8kn4n_oPEpw`)

```json
{
  "criteria": { "to": "*@*" },
  "action":   { "forward": "alex@kudinov.com" }
}
```

Catch-all filter that forwards every message in the mailbox to `alex@kudinov.com`. Created before NanoClaw existed.

### Path 2 — Gmail Auto-Forwarding (Settings → Forwarding and POP/IMAP)

```json
{
  "enabled": true,
  "emailAddress": "cherie@tandemcoaching.academy",
  "disposition": "leaveInInbox"
}
```

Mailbox-level auto-forward to Cherie. `leaveInInbox` means mail is also kept in `info@` — that's what lets NanoClaw classify it.

### Filter that must NOT be touched

```json
{
  "criteria": { "to": "gru@tandemcoach.co" },
  "action":   { "addLabelIds": ["Label_29"] }
}
```

Label-only. Unrelated to cutover. Leave alone.

### Verified forwarding addresses

The mailbox has 11 verified forwarding destinations (alex@kudinov.com, cherie@tandemcoaching.academy, and others). These are pre-authorized targets, not active forwarders. Do not delete them — they'll be needed if rollback is required.

---

## Pre-cutover Checklist (48h Green Gate)

All must be green for ≥48h before flipping the switch. Run each query against the prod Postgres `nanoclaw_business` DB via the Mac Mini Apple Container bridge (192.168.64.1:5432).

### 1. Classification volume has a stable baseline

```sql
-- Hourly classification counts for the past 7 days.
SELECT date_trunc('hour', classified_at) AS hour, COUNT(*) AS n
FROM email_classifications
WHERE classified_at >= NOW() - INTERVAL '7 days'
GROUP BY 1 ORDER BY 1 DESC LIMIT 48;
```

Record the mean and stddev over the most recent 24 complete hours into `setup/gmail/cutover-soak-YYYY-MM-DD.log` as `baseline_per_hour` and `baseline_stddev`.

### 2. Zero stale `hive_sync=false` rows older than 30 min

```sql
SELECT COUNT(*) AS stale_unsynced
FROM email_classifications
WHERE hive_synced = false
  AND classified_at < NOW() - INTERVAL '30 minutes'
  AND (SELECT hive_share_target FROM classification_taxonomy
       WHERE label = email_classifications.label) IS NOT NULL;
```

Expected: `0`. Non-zero means hive bridge is missing writes — halt and investigate.

### 3. Zero dead-lettered hive syncs in last 24h

```sql
SELECT COUNT(*) AS dead_lettered
FROM email_classifications
WHERE hive_sync_dead_lettered = true
  AND classified_at >= NOW() - INTERVAL '24 hours';
```

Expected: `0`. Any non-zero row must be manually investigated via router_state or Slack error logs.

### 4. `MrGru/other` fallback rate ≤ 5%

```sql
SELECT
  COUNT(*) FILTER (WHERE label = 'MrGru/other') * 100.0
    / NULLIF(COUNT(*), 0) AS other_pct
FROM email_classifications
WHERE classified_at >= NOW() - INTERVAL '24 hours';
```

Expected: `other_pct <= 5`. If higher, the taxonomy is missing categories — file lessons via chief and let backfill settle before cutover.

### 5. At least one classification routed to each Hive share_target

```sql
SELECT
  ct.hive_share_target,
  COUNT(*) AS n
FROM email_classifications ec
JOIN classification_taxonomy ct ON ct.label = ec.label
WHERE ec.classified_at >= NOW() - INTERVAL '48 hours'
  AND ct.hive_share_target IS NOT NULL
GROUP BY 1 ORDER BY 1;
```

Expected: both `{cherie}` and `{cherie,alex}` appear with non-zero counts (plus any `{alex}`-only rows if present). Zero in any bucket means that share path has never actually fired in production — do not proceed.

### 6. Daemon uptime + watchdog healthy

```bash
launchctl list | grep com.nanoclaw   # should show a numeric PID, not "-"
cat ~/.claude/proxy/health.json       # status: "ok"
```

---

## Cutover Steps

Execute in order. Time-stamp each step in the soak log.

### Step A — Re-confirm snapshot is current

```bash
cd ~/dev/NanoClaw
npx tsx scripts/apply-gmail-filter.ts --export --file setup/gmail/pre-cutover-filter.json
git diff setup/gmail/pre-cutover-filter.json
```

Expected: either zero diff, or a commit-worthy diff if new filters were added since the last export. Commit the refreshed snapshot before proceeding — rollback depends on it.

### Step B — Disable the catch-all filter

1. Open Gmail in a browser, signed in as `info@tandemcoaching.academy`.
2. Settings (gear) → See all settings → **Filters and Blocked Addresses**.
3. Locate the filter with criteria `Matches: (to:*@*)` and action `Forward to alex@kudinov.com`.
4. Click **edit**.
5. On the criteria page click **Continue**.
6. **Uncheck** "Forward it to: alex@kudinov.com". Keep every other action checked.
7. Click **Update filter**.

Verification (run from Mac Mini):

```bash
npx tsx scripts/apply-gmail-filter.ts --export --file /tmp/post-step-b.json
diff <(jq '.filters' setup/gmail/pre-cutover-filter.json) \
     <(jq '.filters' /tmp/post-step-b.json)
```

Expected: one filter lost its `forward` action, all other fields unchanged.

### Step C — Disable mailbox auto-forwarding

1. Same browser session (info@ mailbox).
2. Settings → See all settings → **Forwarding and POP/IMAP**.
3. Under "Forwarding", select **Disable forwarding**.
4. Click **Save Changes** at the bottom of the page.

Verification:

```bash
npx tsx scripts/apply-gmail-filter.ts --export --file /tmp/post-step-c.json
jq '.autoForwarding' /tmp/post-step-c.json
```

Expected: `{ "enabled": false }` (the `emailAddress` and `disposition` fields may or may not be present — the `enabled: false` flag is the thing that matters).

### Step D — Post-cutover smoke test

Send a test email from an external account to `info@tandemcoaching.academy` with subject `CUTOVER-SMOKE-{timestamp}`. Within 30s, verify:

1. A row lands in `email_classifications`:
   ```sql
   SELECT label, hive_synced, classified_at
   FROM email_classifications
   WHERE subject LIKE 'CUTOVER-SMOKE-%'
   ORDER BY classified_at DESC LIMIT 1;
   ```
2. The Gmail thread carries a `MrGru/...` label in the info@ mailbox.
3. If the label has a `hive_share_target`, the Hive `conversations/{threadId}` doc has `assignee` set (check via Firebase console or Hive UI).
4. Neither `alex@kudinov.com` nor `cherie@tandemcoaching.academy` receives a copy — confirm by DM.

---

## Post-cutover Monitoring (hourly, 48h)

Run these via `setup/gmail/monitor-unclassified.sh` (to be created as part of T25) or by hand on an hourly cron. All alerts go to `#gru-chief` via `send_message`.

### 1. Classification volume baseline

```sql
SELECT COUNT(*) FROM email_classifications
WHERE classified_at >= NOW() - INTERVAL '1 hour';
```

**Alert if** `count < 0.5 * baseline_per_hour` (50% of the 24h pre-cutover baseline recorded in `cutover-soak-YYYY-MM-DD.log`). Classification volume dropping is the earliest signal that the pipeline has silently broken.

### 2. `MrGru/other` fallback rate

```sql
SELECT
  COUNT(*) FILTER (WHERE label = 'MrGru/other') * 100.0
    / NULLIF(COUNT(*), 0) AS other_pct
FROM email_classifications
WHERE classified_at >= NOW() - INTERVAL '1 hour';
```

**Alert if** `other_pct > 5`. (Note: `label NOT LIKE 'MrGru/%'` would be incorrect — `label` is always a `MrGru/` string by constraint. Missing classifications are absent rows, not non-class labels. The `MrGru/other` rate is the correct fallback signal.)

### 3. `MrGru/lead/%` volume regression (soft alert)

```sql
SELECT COUNT(*) FROM email_classifications
WHERE classified_at >= NOW() - INTERVAL '24 hours'
  AND label LIKE 'MrGru/lead/%';
```

**Alert if** `count < 0.8 * lead_baseline_per_day` (> 20% drop vs. the 7-day lead baseline). Missed leads is the worst failure mode — they don't get re-classified, they just vanish.

### 4. Dead-lettered hive syncs

```sql
SELECT COUNT(*) FROM email_classifications
WHERE hive_sync_dead_lettered = true
  AND classified_at >= NOW() - INTERVAL '1 hour';
```

**Alert if** `count > 0`. Every row here is a classification that reached the DB and Gmail but never made it into Hive — a human needs to eyeball it.

---

## Phase 1 Correction Guidance

**Do NOT correct labels via the Gmail UI until Phase 2 (T14 — label-change detection) ships.** Gmail UI label edits will NOT propagate back to the classifier in Phase 1 — they're a silent no-op from NanoClaw's perspective.

To correct a misclassification in V1, use one of:

1. **Slack → `#gru-chief`**: DM chief with a correction. Example: `"Incorrectly labeled MrGru/vendor/cold — this is from an active client at ContosoCorp. Add sender_exact rule: contact@contosocorp.com → MrGru/client/active."` Chief will construct a `route_lesson` IPC targeting mailman.
2. **Direct lesson (advanced)**: write the lesson file into `groups/chief/lessons/pending.md` and let the merge cycle pick it up.

Either path triggers `classify-backfill.ts`, which re-labels matching historical rows in one pass (capped at 25 rows per rule; >20% of corpus requires an `--override` flag that only the operator can issue).

---

## Rollback Procedure

If monitoring trips during the 48h post-cutover window, or if humans report missed emails:

### Option A — 1-click rollback (preferred)

```bash
cd ~/dev/NanoClaw
npx tsx scripts/apply-gmail-filter.ts --file setup/gmail/pre-cutover-filter.json --dry-run
# verify output shows "would create 1 filter + restore autoForwarding"
npx tsx scripts/apply-gmail-filter.ts --file setup/gmail/pre-cutover-filter.json
```

The script:

- Re-creates any filter present in the snapshot but missing from the live account (matched by `id` first, then by `criteria` signature).
- Restores the `autoForwarding` enabled/emailAddress/disposition trio via `users.settings.updateAutoForwarding`.
- Skips everything that already matches — safe to re-run.

### Option B — Manual rollback (if the script is unavailable)

1. **Restore the filter:**
   1. Gmail → Settings → Filters and Blocked Addresses → **Create a new filter**.
   2. In "To", enter `*@*` (literal).
   3. Click **Create filter**.
   4. Check **Forward it to** → select `alex@kudinov.com` from the dropdown (it's already in the pre-authorized list; no re-verification needed).
   5. Click **Create filter**.

2. **Restore auto-forwarding:**
   1. Gmail → Settings → Forwarding and POP/IMAP.
   2. Under "Forwarding", select **Forward a copy of incoming mail to** → `cherie@tandemcoaching.academy`.
   3. Set the dropdown to **keep Gmail's copy in the Inbox** (= `leaveInInbox`).
   4. Click **Save Changes**.

### After rollback

- File an incident note in `setup/gmail/cutover-incident-YYYY-MM-DD.md` with: what triggered the alert, what was missed, hypothesis, and what to fix before the next cutover attempt.
- Run the monitoring queries every hour for the next 24h to confirm rollback restored normal flow.
- Do NOT reattempt cutover without a new 48h soak.

---

## Success Exit Criteria (lift this doc out of draft)

- 48h post-cutover with zero alerts on queries 1–4 above.
- Alex and Cherie both confirm via Slack DM that they haven't noticed any missed email during the soak window.
- `setup/gmail/cutover-soak-YYYY-MM-DD.log` committed with baseline + hourly measurements.
- T26 completed (MEMORY/CLAUDE/MANIFEST updated + ecosystem signal filed).
