# CaleProcure Scan Workflow

Execute this workflow as part of the daily scan (after Bonfire scan) or when triggered by `rescan caleprocure`.

CaleProcure is California's state procurement portal (caleprocure.ca.gov). It runs on PeopleSoft Strategic Sourcing — pages require a real browser session (direct HTTP returns 403). No login is required for browsing/searching.

Post progress to Slack via `mcp__nanoclaw__send_message` at each milestone.

---

## Step 1 — Navigate to Search

No authentication needed. Navigate directly to the search page:

```bash
agent-browser open "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx"
agent-browser wait --load networkidle
agent-browser snapshot -i
```

If the page doesn't load (403, timeout, or blank): wait 10s, retry once. If still failing, report to Slack and skip CaleProcure scan (Bonfire scan results are still valid).

## Step 2 — Search by Keyword

The search interface has a keyword text field and optional filters. Use keyword search — the AJAX-driven results update dynamically.

Keywords (one search at a time — same as Bonfire):
1. `coaching`
2. `leadership development`
3. `executive coaching`
4. `organizational development`
5. `change management`
6. `facilitation`
7. `training leadership`
8. `team coaching`
9. `talent development`

For each keyword:
1. Clear any previous search
2. Enter keyword in the search field
3. Wait for results to load (AJAX — watch for table/list to populate)
4. Post progress: "CaleProcure: Searching '{keyword}' — {N} results..."
5. Extract opportunities from results
6. If paginated (>25 results), navigate first 2 pages
7. Clear search, next keyword

**Alternative:** If the search supports UNSPSC code filtering, also try:
- `86132001` — Executive coaching service
- `86132000` — Management education and training services

De-duplicate results across searches.

## Step 3 — Extract Opportunities

For each result in the search table, extract:

| Field | Description |
|-------|-------------|
| `title` | Event name |
| `agency` | Department name |
| `close_date` | Due/end date |
| `category` | Event type (RFP, IFB, RFQ, etc.) or UNSPSC code |
| `url` | Detail page URL — prefer clean format: `https://caleprocure.ca.gov/event/{BU}/{AUC_ID}` |
| `event_id` | The AUC_ID from the URL or result row |
| `search_keyword` | Which keyword search found this |

Build a JSON array (de-duplicated by event_id or URL).

## Step 4 — Dedup Against Database

Query existing CaleProcure opportunities:

```bash
psql -t -A -c "SELECT bonfire_id, status FROM procurement_opportunities WHERE source = 'caleprocure'"
```

For each scraped opportunity, use event_id as the bonfire_id:

- event_id exists AND status='rejected' → **skip**
- event_id exists AND other status → **UPDATE** close_date, last_seen_at if changed
- event_id NOT in DB → **INSERT** as status='new', include in notification

Mark expired:

```bash
psql -c "UPDATE procurement_opportunities SET status='expired' WHERE source='caleprocure' AND close_date < CURRENT_DATE AND status NOT IN ('rejected', 'expired', 'scraped', 'submitted', 'passed')"
```

## Step 5 — Evaluate Relevance

Same criteria as Bonfire — read `/workspace/extra/knowledge/KNOWLEDGE.md` for relevance rules.

**Relevant / Noise / Borderline** classifications are identical across portals.

Assign: `relevance` (relevant/borderline/noise) and `relevance_reason`.

## Step 6 — Insert/Update DB

For new opportunities, INSERT with `source = 'caleprocure'`:

```bash
psql -c "INSERT INTO procurement_opportunities
  (bonfire_id, bonfire_url, title, agency, close_date, category, search_keyword, relevance, relevance_reason, source, raw_snapshot)
VALUES
  ('EVENT_ID', 'URL', 'TITLE', 'AGENCY', 'DATE', 'CAT', 'KW', 'relevant', 'reason', 'caleprocure', \$\$JSON\$\$::jsonb)
ON CONFLICT (bonfire_id) DO UPDATE SET last_seen_at = NOW()"
```

**Note:** `bonfire_id` stores the CaleProcure event_id (e.g., '0000038540'). The column name is legacy from Bonfire — it's a generic opportunity ID field.

## Step 7 — Notify

Post results with CaleProcure-specific prefix:

```
[PROCUREMENT-CA] CaleProcure scan — {N} new relevant opportunities

---
{TITLE}
Agency: {agency}
Closes: {close_date}
Category: {category}
Source: CaleProcure (caleprocure.ca.gov)
URL: {url}
Commands: "process {event_id}" to scrape details | "drop {event_id} [reason]" to reject
---

Total scanned: {total} | New: {new} | Updated: {updated}
```

If no new: `[PROCUREMENT-CA] CaleProcure scan — no new relevant opportunities`

## Step 8 — Close Browser

Do NOT close the browser if the Bonfire scan ran first and the CaleProcure scan is part of the same daily cycle — the browser stays open. Only close after ALL portal scans are complete:

```bash
agent-browser close
```

---

## CaleProcure-Specific Notes

- **No auth state needed** — CaleProcure is public. No auth state file to manage.
- **Session cookies are automatic** — the browser handles them. Just navigate and interact.
- **AJAX-driven results** — always wait for content to load after search. Use `agent-browser wait @TABLE_REF` or similar before extracting.
- **Event IDs can be alphanumeric** — e.g., `0000038540` (numeric) or `01A6573` (alphanumeric). Store as-is in bonfire_id.
- **Business Unit codes** — the 4-digit number in URLs (e.g., `3900` for CARB) identifies the agency in PeopleSoft. Not needed for our purposes — we extract agency name directly.
- **Submission method varies** — some agencies use CaleProcure portal upload, others require email. The scrape workflow extracts this from the detail page and includes it in Brief.md.
