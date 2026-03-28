# El Campanero - Job Knowledge

## Registered Jobs

### calendar-refresh
- **Schedule:** Daily at 6:00 AM CT
- **Script:** `tandemweb:tools/update-calendars.sh`
- **Runtime:** ~15 seconds
- **What it does:** Refreshes cached Google Calendar data for program pages (ACC, PCC, ACTC, Mentor) and purges/warms page caches so visitors see current dates.
- **Failure meaning:** Program pages may show stale dates. Usually transient (API timeout). Retries once automatically.

### weekly-data-refresh
- **Schedule:** Monday at 5:00 AM CT
- **Script:** `tandemweb:tools/weekly-refresh.sh`
- **Runtime:** 20-60 minutes
- **What it does:** Full weekly data pipeline - pulls GSC metrics, syncs catalog, generates related posts, nav suggested reads, CTAs, deploys changes, purges and warms cache.
- **Failure meaning:** Stale SEO data and content recommendations for the week. Check the log file for which step failed. Does NOT retry (too long-running for automatic retry).
- **Lockfile:** `/tmp/tandem-weekly-refresh.lock` - cleaned up on failure/timeout.

### rss-scan
- **Schedule:** Monday at 6:00 AM CT
- **Script:** `tandemweb:tools/newsroom/scan_rss.py`
- **Runtime:** ~2 minutes
- **What it does:** Scans RSS feeds for newsletter signal discovery. Produces a scan file for downstream curation.
- **Failure meaning:** Newsletter curation (8 AM) will work with stale signals. Not critical if it fails occasionally.

### newsletter-curation
- **Schedule:** Monday at 8:00 AM CT
- **Script:** `tandemweb:tools/newsroom/curate_weekly.py`
- **Runtime:** ~10 minutes
- **What it does:** Uses AI (Straico) to generate newsletter drafts from RSS signals and catalog data.
- **Failure meaning:** No newsletter drafts for the week. Check Straico API balance if it fails. Does NOT retry (AI generation is expensive).
- **Prerequisite:** RSS scan should have run successfully. Will warn if scan data is stale.

### pulse-collection
- **Schedule:** Monday at 7:00 AM CT
- **Script:** `tandemweb:tools/pulse/orchestrate.py --phases all`
- **Runtime:** 10-30 minutes
- **What it does:** Content health data collection from GSC + DataForSEO, decay analysis, triage, and daily digest.
- **Failure meaning:** No content health update for the week. Check DataForSEO budget if the serp_batch phase fails.
- **Lockfile:** `/tmp/pulse.lock`

## Escalation

If a job fails repeatedly or you see unusual patterns (all jobs failing, timeouts increasing), notify the user. You cannot fix infrastructure issues - your role is to report and manage the schedule.

## Common User Requests

- "What ran last night?" -> `jobs list` (check last run times)
- "Run the calendar refresh" -> `jobs run calendar-refresh`
- "Pause everything" -> `jobs pause` each job individually
- "What happened with the weekly refresh?" -> `jobs status weekly-data-refresh`
