# Scan Workflow

Execute this workflow when triggered by "Run daily procurement scan" (scheduled) or `rescan` (manual).

Run the scan silently. Do NOT post per-step or per-keyword progress to Slack — the host already posts a mechanical processing message when you start. Post to Slack only for a blocking error (Step 1) or the final new-opportunity results (Step 6).

---

## Step 1 — Authenticate

Load saved auth state from `/workspace/group/auth/bonfire-state.json`:

```bash
agent-browser state load /workspace/group/auth/bonfire-state.json 2>/dev/null
agent-browser open "https://vendor.bonfirehub.com"
agent-browser snapshot -i
```

If login form visible:

```bash
agent-browser fill @EMAIL_REF "$BONFIRE_USERNAME"
agent-browser fill @PASSWORD_REF "$BONFIRE_PASSWORD"
agent-browser click @LOGIN_BUTTON_REF
agent-browser wait --load networkidle
agent-browser state save /workspace/group/auth/bonfire-state.json
```

If login fails (wrong credentials, CAPTCHA, MFA) → report to Slack and stop.

## Step 2 — Search by Keyword

IMPORTANT: Do NOT browse all opportunities. The portal has 13,000+ listings. Use the search interface.

Keywords (one search at a time):
1. `coaching`
2. `leadership development`
3. `executive coaching`
4. `organizational development`
5. `change management`
6. `facilitation`
7. `training leadership`
8. `team coaching`
9. `talent development`

For each: enter keyword, wait for results, extract opportunities, paginate if total < 50 (first 2 pages if > 50), clear search, next keyword.

De-duplicate results across searches (same opportunity may match multiple keywords).

## Step 3 — Extract Opportunities

For each result, extract:

| Field | Description |
|-------|-------------|
| `title` | Opportunity name |
| `agency` | Issuing organization |
| `close_date` | Submission deadline |
| `category` | Category or commodity code |
| `url` | Link to detail page |
| `search_keyword` | Which keyword search found this |

Build a JSON array (de-duplicated by URL or title+agency).

## Step 4 — Dedup Against Database

Query existing opportunities:

```bash
psql -t -A -c "SELECT bonfire_id, status FROM procurement_opportunities"
```

Extract bonfire_id for each scraped opportunity:
- From URL: regex `/\/opportunities\/(\d+)$/`
- For null-URL: `echo -n "TITLE+AGENCY" | sha256sum | cut -c1-8`

For each scraped opportunity:
- bonfire_id exists AND status='rejected' → **skip** (do not notify)
- bonfire_id exists AND other status → **UPDATE** close_date, last_seen_at if changed
- bonfire_id NOT in DB → **INSERT** as status='new', include in notification

Mark expired:

```bash
psql -c "UPDATE procurement_opportunities SET status='expired' WHERE close_date < CURRENT_DATE AND status NOT IN ('rejected', 'expired', 'scraped', 'submitted', 'passed')"
```

## Step 5 — Evaluate Relevance

For each NEW opportunity, evaluate against knowledge file criteria. Read `/workspace/extra/knowledge/KNOWLEDGE.md` for detailed relevance rules.

**Relevant signals:** Executive coaching, leadership coaching, team coaching, coach training, leadership development, organizational development, change management, strategic planning facilitation, team building, professional development training, talent development, succession planning, DEI consulting (coaching-focused).

**Noise signals:** Sports coaching, IT consulting, construction, financial auditing, legal services, medical/clinical, janitorial, marketing (unless leadership), staffing agencies, equipment procurement.

**Borderline:** When unclear, include with "borderline" flag. Better to surface than miss.

Assign: `relevance` (relevant/borderline/noise) and `relevance_reason` (one sentence).

## Step 6 — Insert/Update DB

For new opportunities:

```bash
psql -c "INSERT INTO procurement_opportunities
  (bonfire_id, bonfire_url, title, agency, close_date, category, search_keyword, relevance, relevance_reason, raw_snapshot)
VALUES
  ('ID', 'URL', 'TITLE', 'AGENCY', 'DATE', 'CAT', 'KW', 'relevant', 'reason', \$\$JSON\$\$::jsonb)
ON CONFLICT (bonfire_id) DO UPDATE SET last_seen_at = NOW()"
```

## Step 7 — Save Snapshot

```bash
mkdir -p /workspace/group/snapshots /workspace/group/auth
cat > /workspace/group/snapshots/$(date +%Y-%m-%d).json << 'SNAPSHOT_EOF'
{ "scanned_at": "TIMESTAMP", "total_count": N, "opportunities": [...] }
SNAPSHOT_EOF
cp /workspace/group/snapshots/$(date +%Y-%m-%d).json /workspace/group/snapshots/latest.json
```

## Step 8 — Notify

Post results via `mcp__nanoclaw__send_message`. Only notify about NEW opportunities (not already in DB).

If new relevant opportunities:

```
[PROCUREMENT] Daily scan — {N} new relevant opportunities

---
{TITLE}
Agency: {agency}
Closes: {close_date}
Category: {category}
Relevance: {reason}
URL: {url}
Commands: "process {bonfire_id}" to scrape details | "drop {bonfire_id} [reason]" to reject
---

Borderline ({M} items):
- {title} ({agency}) — closes {date}

Total scanned: {total} | New: {new} | Updated: {updated}
```

If no new relevant opportunities:

```
[PROCUREMENT] Daily scan — no new relevant opportunities
Scanned: {total} | All {existing} known opportunities up to date
Next scan: tomorrow
```

## Step 9 — Close Browser

```bash
agent-browser close
```
