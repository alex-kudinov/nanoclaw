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

The host release owns the completeness plan below. Search every unit exactly as
written, one at a time:
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
4. Extract opportunities from results
5. If paginated (>25 results), navigate first 2 pages
6. Clear search, next keyword

**Optional expansion (does not replace any host-planned unit):** If the search
supports UNSPSC code filtering, also try:
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

## Step 4 — Submit One Complete Host Batch

Do not query or write `procurement_opportunities` directly. Portal rows are
untrusted data and the host owns validation, timestamps, deduplication,
parameterized writes, source-run completion, and retry identity.

Call `mcp__nanoclaw__procurement_caleprocure_ingest` once after all keyword
pages have been extracted:

- `run_key`: a stable key for this exact batch, such as
  `cale-YYYYMMDD-HHMM-{short-batch-hash}`;
- `rows`: the complete JSON array from Step 3, including the keyword on every
  row; duplicates across keywords are expected and are host-deduplicated.
- `observed_units`: every host-planned keyword whose requested result pages
  actually loaded and were inspected. Never include a keyword that timed out,
  failed, or was skipped. Empty results still count as observed when the page
  loaded successfully.
- `coverage_evidence`: one public, bounded object for every `observed_units`
  keyword, with exactly `resultCount` (a non-negative integer) and
  `pagesVisited` (a positive integer). The keys must exactly match
  `observed_units`. Do not include cookies, credentials, or raw page snapshots.

The call is bounded to 200 rows and can be default-off during shadow rollout.
If the host denies or fails the batch:

- do not split it into smaller calls to evade the bound;
- do not fall back to `psql`;
- report the run key and host denial to Slack;
- keep the local extraction artifact for a separately authorized retry.

Only `[PROCUREMENT CALEPROCURE INGESTED]` is a terminal host receipt. Inspect its
derived state and missing-unit list: `complete` means every host-planned unit
has a structurally valid container-reported coverage receipt. It is an
auditable adapter receipt, not independent proof that the portal search
happened. `partial` or `failed` must be reported and retried with the same run
key and exact batch evidence. A queued MCP response is not completion.

## Step 5 — Evaluate the Host Queue

Same criteria as Bonfire — read `/workspace/extra/knowledge/KNOWLEDGE.md` for relevance rules.

**Relevant / Noise / Borderline** classifications are identical across portals.

Call `mcp__nanoclaw__procurement_queue`. For each current row you evaluate,
call `mcp__nanoclaw__procurement_review_card` with:

- the exact `opportunity_id` and `review_version`;
- one recommendation: `process`, `drop`, or `needs_info`;
- the decisive relevance evidence or missing information.

The host renders current database truth and the recommendation into one
version-bound Slack card. The recommendation does not change state. A named
human must reply in the card thread using the exact decision syntax printed by
the host; only `[PROCUREMENT DECISION RECORDED]` proves the transition.

## Step 6 — Notify

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
Review: use the host card in this opportunity's Slack thread
---

Total extracted: {total} | Host run: {run_id} ({status}) | New observations: {new} | Missing units: {missing_or_none}
```

If no new: `[PROCUREMENT-CA] CaleProcure scan — no new relevant opportunities`

## Step 7 — Close Browser

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
