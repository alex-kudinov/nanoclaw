# Detail Scrape Workflow

Execute this workflow when triggered by the `process` command.

Post progress to Slack at each milestone. Never go more than 60 seconds idle.

---

## Step 0 — Identify Source Portal

Before scraping, query the source:

```bash
psql -t -A -c "SELECT source, bonfire_url FROM procurement_opportunities WHERE bonfire_id='ID'"
```

This determines which portal to navigate to and how to handle auth. Bonfire requires auth state; CaleProcure does not.

## Step 1 — Update Status

```bash
psql -c "UPDATE procurement_opportunities SET status='scraping', scrape_attempts = scrape_attempts + 1 WHERE bonfire_id='ID'"
```

## Step 2 — Authenticate and Navigate

**If source = 'bonfire':** Load Bonfire auth state and navigate to portal:

```bash
agent-browser state load /workspace/group/auth/bonfire-state.json 2>/dev/null
agent-browser open "https://vendor.bonfirehub.com"
agent-browser snapshot -i
```

If login required, fill `$BONFIRE_USERNAME` / `$BONFIRE_PASSWORD`, click login, save state.

**If source = 'caleprocure':** No authentication needed. Navigate directly to the opportunity URL:

```bash
agent-browser open "{bonfire_url}"
agent-browser wait --load networkidle
```

CaleProcure is public but requires a real browser session (direct HTTP returns 403).

## Step 3 — Navigate to Detail Page

The browser runs on host Mac Mini via CDP bridge (real Chrome, persistent profile). This bypasses Cloudflare bot detection on agency subdomains.

If the opportunity has a URL, navigate directly:

```bash
agent-browser open "URL"
agent-browser wait --load networkidle
```

If a Cloudflare challenge page appears ("Verify you are human" or similar):
1. Wait 10 seconds: `agent-browser wait 10000`
2. Re-snapshot to check if resolved
3. If still blocked, try navigating from vendor.bonfirehub.com search results (click-through carries session cookies)
4. If still blocked after retry, scrape from listing + public sources

If null URL, search by title on the portal and click through.

## Step 4 — Extract Details

From the detail page, extract:
- Full description
- Requirements / qualifications
- Evaluation criteria
- Timeline / key dates
- Contact information
- Budget (if disclosed)
- Attachments list

Use `agent-browser snapshot -i` and `agent-browser get text` to extract structured data.

## Step 5 — Download Attachments

Downloads save to the HOST vault directory via agent-browser.json downloadPath config.

```bash
agent-browser click @DOWNLOAD_LINK_REF
agent-browser wait 5000
ls /workspace/extra/vault-procurement/*.pdf 2>/dev/null
mv /workspace/extra/vault-procurement/*.pdf /workspace/extra/vault-procurement/{bonfire_id}-{slug}/
```

If Cloudflare blocks the download (403 or redirect), report in brief and Slack. Page content should still be fully extracted.

## Step 6 — Read PDF and Write Brief

READ the PDF before writing documents. The PDF is authoritative — Brief.md must be generated FROM the PDF content, not from listing data alone.

```bash
cat /workspace/extra/vault-procurement/{bonfire_id}-{slug}/*.pdf
```

If no PDF was downloaded, use page-extracted data as fallback and flag as "partial."

Write `Brief.md` using the Brief Template below. Do NOT create a Response Draft — proposal content is assembled by the `draft` command using framework files.

## Step 7 — Write to Vault

Test write access:

```bash
echo "test" > /workspace/extra/vault-procurement/write-test && rm /workspace/extra/vault-procurement/write-test
```

If fails: keep files in `/workspace/group/temp/`, warn in Slack, set last_error in DB.

If passes:

```bash
SLUG=$(echo "{title}" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | head -c 50)
mv /workspace/group/temp/{bonfire_id} /workspace/extra/vault-procurement/{bonfire_id}-${SLUG}
```

## Step 8 — Update DB

```bash
VAULT_PATH="{bonfire_id}-${SLUG}"
psql -c "UPDATE procurement_opportunities SET status='scraped', detail_data=\$\${DETAIL_JSON}\$\$::jsonb, vault_path='${VAULT_PATH}', scraped_at=NOW() WHERE bonfire_id='ID'"
```

## Step 9 — Notify

Post to Slack:

```
[PROCUREMENT{-CA if source=caleprocure}] Detail scrape complete: {title}

Agency: {agency}
Source: {Bonfire Hub / CaleProcure}
Close date: {close_date}
Attachments: {N} files downloaded
Vault: {vault_path}

Summary: {2-3 sentence summary of the opportunity}
Submission: {how to submit — Bonfire portal / email to X / CaleProcure portal / etc.}

Next steps: Review Brief.md in vault. Type "draft {bonfire_id}" to assemble proposal.
```

## Step 10 — Close Browser

```bash
agent-browser close
```

## On Failure

If scrape crashes or fails:
- Status stays 'scraping' in DB
- On next `process` for the same opportunity, detect stale 'scraping' status (>1 hour since updated_at) and resume from Step 2
- Set last_error with description

---

# Brief.md Template

Always include a **Bid Recommendation** section immediately after the header metadata. This is the most important section — it tells a human whether to pursue in 60 seconds.

```markdown
# {Title}

- **Agency:** {agency}
- **ID:** {bonfire_id}
- **Source Portal:** {Bonfire Hub / CaleProcure}
- **Close Date:** {close_date}
- **RFP #:** {reference number from PDF}
- **URL:** {url or "N/A"}
- **Submission Method:** {Bonfire portal upload / Email to X@agency.gov / CaleProcure portal / Mail to address}
- **Status:** Scraped {date} | Source: {PDF / page-only / partial}

## Bid Recommendation

{3-5 sentences: Should we bid? Why or why not?
- Fit score (Excellent / Strong / Moderate / Weak)
- Key strengths Tandem brings
- Key risks or gaps
- Competitive landscape if known
- Deadline pressure}
```

Remaining sections in order: Executive Summary, Scope of Services, Requirements & Qualifications, Evaluation Criteria, Timeline, Budget, Contact, Submission Requirements, Attachments, Competitive Intelligence, Notes.
