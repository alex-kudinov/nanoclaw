# CaleProcure Scan Workflow

> **Retired agent workflow. Do not execute.** CaleProcure collection moved to
> the release-owned `procurement-caleprocure-collector` host job after four
> model-driven browser canaries failed to produce reliable business evidence.
> The remaining text is retained only as historical evidence for the host
> collector's assertions. Agents must not browse, self-report coverage, or call
> the legacy CaleProcure ingest IPC.

Execute this workflow as part of the daily scan (after Bonfire scan) or when triggered by `rescan caleprocure`.

CaleProcure is California's state procurement portal (caleprocure.ca.gov). It runs on PeopleSoft Strategic Sourcing — pages require a real browser session (direct HTTP returns 403). No login is required for browsing/searching.

Post progress to Slack via `mcp__nanoclaw__send_message` at each milestone.

---

## Step 1 — Navigate to Search

No authentication needed. Navigate directly to the search page:

```bash
agent-browser open "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx"
agent-browser wait 10000
agent-browser snapshot -i
```

Do not wait for `networkidle`: this PeopleSoft page keeps background/AJAX work
alive and may never reach that state. A successful load is the visible `Event
Search` heading plus either `Showing Results` or `No event met your search
criteria`. If those markers are absent (403, timeout, blank, or still
`Loading...`), wait 10s and snapshot once more. If they are still absent,
report to Slack and skip CaleProcure scan (Bonfire scan results are still
valid).

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
Resolve controls from a fresh interactive snapshot before acting: run
`agent-browser snapshot -i`, then use the refs for the visible `Clear Criteria`,
`Event Name`, and `Search` controls. Use the accessibility snapshot for the
visible result summary and grid. Never use an unqualified text match.

1. Click the visible `Clear Criteria` ref. Confirm the visible `Event Name`
   input is empty; do not merely select or overwrite its prior text.
2. Enter the exact keyword in the visible `Event Name` input.
3. Click the visible `Search` ref. Filling the input does **not** execute a
   search, and pressing Enter is not an accepted substitute on this page.
4. Wait 4 seconds, then snapshot. If the visible results/no-results marker has
   not changed, wait 6 more seconds and snapshot once more. Do not use
   `networkidle`.
5. Confirm that the visible `Event Name` input still contains the exact keyword
   and read only the visible results summary and visible grid. The responsive
   page may keep hidden duplicate summaries, rows, and element IDs; hidden
   copies are never evidence for the current search.
6. If a snapshot yields multiple result-summary/grid candidates or you cannot
   establish which candidate is visible, the state is ambiguous: omit that
   keyword from `observed_units` and do not guess.
7. Extract opportunities from visible result rows.
8. If paginated (>25 results), navigate the first 2 pages.
9. Continue with a fresh snapshot and `Clear Criteria`, then the next keyword.

Before extracting, confirm all three facts: the visible `Event Name` input
contains the current keyword; the visible `Search` button was clicked for that
keyword; and the page shows either the resulting visible `Showing Results`
summary or the visible no-results message. The default unfiltered page
currently shows hundreds of posted events; never treat that default table as
the result of a planned unit. If the action or visible-state proof is
ambiguous, omit that keyword from `observed_units` and report the run partial.

**Optional expansion (does not replace any host-planned unit):** If the search
supports UNSPSC code filtering, also try:

- `86132001` — Executive coaching service
- `86132000` — Management education and training services

De-duplicate results across searches.

The page can retain hidden summaries or rows from the prior/default search,
including a hidden `Showing Results 0 of 0` alongside a visible positive
summary. Determine the count from the visible summary and visible grid only.
When the visible page says `No event met your search criteria`, the current
keyword has zero results: ignore every retained/hidden table row and record
`resultCount: 0`.

## Step 3 — Extract Opportunities

For each result in the search table, extract:

| Field            | Description                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `title`          | Event name                                                                                 |
| `agency`         | Department name                                                                            |
| `close_date`     | Due/end date                                                                               |
| `category`       | Event type (RFP, IFB, RFQ, etc.) or UNSPSC code                                            |
| `url`            | Verified detail page URL in clean format: `https://caleprocure.ca.gov/event/{BU}/{AUC_ID}` |
| `event_id`       | The AUC_ID from the URL or result row                                                      |
| `business_unit`  | The `{BU}` path segment from the verified detail URL                                       |
| `search_keyword` | Which keyword search found this                                                            |

Build a JSON array (de-duplicated by event_id or URL).

The host tool schema is strict. Each row may contain only `event_id`, `title`,
`agency`, `search_keyword`, `business_unit`, and the optional `close_date`,
`category`, and `url`. Although the wire schema permits omitting
`business_unit`, the host requires a stable CaleProcure identity: every row
must supply `business_unit` or a verified clean `url` containing the same
business-unit and event-ID pair. Never submit a result-row ID with neither.

Resolve the business unit inside CaleProcure without guessing:

1. Open the visible `Look up businessUnit` control from an interactive snapshot
   ref.
2. Use the lookup's own visible filter/search control to enter the exact
   department name. Execute that search and require its visible reported result
   count to be exactly 1. If the lookup exposes no filter/count, prove global
   uniqueness across every lookup page; if that cannot be done, the identity is
   ambiguous. Compare names after trimming, collapsing internal whitespace,
   and ignoring case only. Substring, fuzzy, abbreviation, and inferred matches
   are forbidden.
3. Use the code from that single exact normalized-name row as the candidate
   business unit. Zero, multiple, hidden-only, or off-page-unchecked matches are
   ambiguous.
4. Construct `https://caleprocure.ca.gov/event/{BU}/{AUC_ID}` with that
   candidate and open it. Accept the identity only when the visible `Event
Details` page repeats the exact event ID and same normalized department name.
   Also confirm the event title when it is available.

This lookup-plus-detail verification is an authoritative portal pairing, not
an agency-name inference. If it cannot be completed, report the keyword
incomplete and do not claim a complete source receipt.

Do not pass the table's `status` (`Posted` is not a category), raw cells,
result counts, or any other key. Omit an optional field when it is unknown or
empty; in particular, never pass `url: ""` or a `javascript:` link. The
complete deduplicated batch must contain at most 200 rows. If a visible result
lacks a verifiable business unit, report the unit incomplete and do not claim
a complete source receipt.

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
- `observed_units`: every host-planned keyword for which you clicked the visible
  `Search` button and then read a visible result summary or visible no-results
  message for that exact keyword. Page load alone is **not** observation. Omit
  a keyword whose search action, exact input, or visible result state you cannot
  prove even when the page loaded. Zero visible results count as observed only
  when the search executed and its visible zero-result state was read.
- `coverage_evidence`: one public, bounded object for every `observed_units`
  keyword, with exactly `resultCount` (a non-negative integer) and
  `pagesVisited` (a positive integer). The keys must exactly match
  `observed_units`. Do not include cookies, credentials, or raw page snapshots.

For a scheduled scan, the host replaces the submitted `run_key` with a
task-bound token before writing the source ledger. The agent-supplied value is
still required for non-scheduled/manual adapter calls, but it is never trusted
as scheduled-task identity and cannot make a different task look complete.

Call the host adapter even when `rows` is empty. Nine successfully observed
zero-result searches are a complete zero-row batch, not a reason to return
without a receipt. A scan is unfinished until the host returns the terminal
ingest line below.

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
happened. `failed` may be retried once with the same run key and byte-identical
batch evidence; that resumes the same ledger row. `partial` may **not** be
retried inside the same scan: the scheduled run key is task-bound, identical
evidence reproduces the same missing units, and corrected evidence is rejected
as a changed batch. Report the missing units and reason to Slack and stop. An
operator reruns the task, which issues a new host token. A queued MCP response
is not completion.

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
- **AJAX-driven results** — filling the `Event Name` input does not submit it.
  Always click the visible `Search` button, then wait for the visible summary
  and visible grid to settle before extracting.
- **Event IDs can be alphanumeric** — e.g., `0000038540` (numeric) or `01A6573` (alphanumeric). Store as-is in bonfire_id.
- **Business Unit codes** — the 4-digit number in URLs (e.g., `3900` for CARB)
  identifies the agency in PeopleSoft and is required for a stable
  CaleProcure identity. Obtain it from a verified detail/authoritative link;
  never infer it from the agency name.
- **Submission method varies** — some agencies use CaleProcure portal upload, others require email. The scrape workflow extracts this from the detail page and includes it in Brief.md.
