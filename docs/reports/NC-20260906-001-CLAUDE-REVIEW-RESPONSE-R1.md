# NC-20260906-001 — Claude review response (R1)

Reviewed only the request and the eight listed artifacts. No other files,
credentials, or systems were inspected; no implementation files were edited.

## Material finding 1 — substring duplicate check can false-positive on certificate-number prefixes

`announce-graduate.sh:129-138`:

```
registrar_url="https://registrar.tandemcoaching.academy/en/verify/${certificate_number}"
...
existing="$(printf '%s' "$threads" | jq --arg url "$registrar_url" '
  [ .[] | select(((.content // .text // "") | contains($url))) ] | first // null')"
```

The duplicate-post guard tests whether an *existing* thread's content
**contains** the current credential's registrar URL as a substring, rather
than an exact/bounded match. Because `registrar_url` ends in a bare
certificate number with no trailing delimiter, any certificate number that is
a string-prefix of another credential's number produces a false match. For
example, if a thread already exists for certificate `1234`
(`.../verify/1234`), announcing a *different*, never-posted certificate `123`
computes `registrar_url = .../verify/123`, and `contains("...verify/123")` is
true against the existing thread's `.../verify/1234` content — jq's
`contains` is a plain substring test, so `"verify/1234"` contains
`"verify/123"` as its first ten characters.

Effect: the tool would return `status:already_announced, created:false` for a
credential that was never actually posted, and per
`EXECUTION-STEPS.md:162-165` / `SKILL.md` step 8, `already_announced` is
treated as a valid idempotent recovery receipt — so the graduate's real,
first-ever announcement is silently skipped, with no exception recorded. This
directly undermines invariant 7 ("Prevent duplicate posts by the branded
registrar URL... never a blind repost" implicitly assumes the *positive* match
is trustworthy) and is a correctness/idempotency defect, not a hardening nit.

The existing test (`test-announce-graduate.sh`) does not catch this because
every scenario reuses the single fixed certificate number `CERT-123` for both
the "new" and "duplicate" cases, so no prefix-collision case is exercised.
Whether this is reachable in production depends on Sertifier's `certificateNO`
issuance scheme (sequential/incrementing numbers would make collisions
common), which is outside this review's evidence, but nothing in the reviewed
code prevents or bounds the match (e.g., requiring the URL be followed by a
non-digit/tag boundary or matching the full `href="..."` value instead of a
raw substring).

## Material finding 2 (lower severity) — inconsistent HTML escaping in the posted message

`announce-graduate.sh:140-152`: `recipient_name` and `credential_title` are
passed through `html_escape()` before interpolation (`safe_name`,
`safe_title`), but `registrar_url` (built from `certificate_number`,
line 129) is interpolated into the `href` attribute unescaped:

```
message="<p>...<a href=\"${registrar_url}\">View the verified certificate.</a></p>"
```

`certificate_number` is provider-generated (Sertifier `certificateNO`), not
directly operator/user-typed like `recipient_name`, so exploitability is
lower than a typical injection path, and no format validation
(`[[ -n "$certificate_number" ]]` only checks non-blank, `announce-graduate.sh:85`)
constrains its character set the way `image_url` is constrained by regex
(`announce-graduate.sh:87`). Given the script already escapes two of three
provider/user-derived fields before building public-facing HTML, the third
(`registrar_url`) should follow the same discipline for defense in depth.

## Invariants checked with no findings

1. Issued/created/emailConfirmed/isPublic gating — enforced at the call sites
   (`EXECUTION-STEPS.md` New Credential Follow-through preamble;
   `SKILL.md` step 8 preamble) before `announce-graduate.sh` is invoked, and
   the tool independently re-verifies `status`/`isPublic` from a fresh
   Sertifier read (`announce-graduate.sh:81-84`).
2. Private / `already_issued` never auto-announced — `isPublic` gate in the
   tool; `already_issued` handling is explicit in both `EXECUTION-STEPS.md`
   and `SKILL.md` step 9.
3. Recipient/title/image/campaign resolved from the exact credential, with
   `campaignId` reconciliation by ID+email search requiring an exact single
   match (`announce-graduate.sh:61-72`) — logic is sound; direct-read fields
   correctly take precedence over the search-derived merge.
4. Exact channel ID + name + `POSTS` type required jointly
   (`announce-graduate.sh:116-127`) — a mismatch on either fails closed.
5. PNG validated by magic bytes, host/path pinned by regex to
   `storage.googleapis.com/verified-storage/cert/*.png`, 10 MB cap enforced
   (`announce-graduate.sh:87-88, 104-111`). Note: `curl -fsSL` follows
   redirects from that pinned host; this is a theoretical (not demonstrated)
   gap if that specific Google-storage path ever redirected off-host, but
   the source URL itself comes from a trusted provider response, not user
   input, so this is not raised as a separate material finding.
6. Dry-run default; live requires both `--execute` and
   `--confirm ANNOUNCE-GRADUATE`, checked after the dry-run early return
   (`announce-graduate.sh:156-171`) — matches contract and tests.
7. Duplicate prevention exists and runs unconditionally (even without
   `--execute`), correctly satisfying "one read-only dry-run reconciliation"
   — see Material finding 1 for the correctness gap in its matching logic.
8. Direct delivery vs. community post kept as separate receipts;
   `announce-graduate.sh` performs no credential mutation and
   `EXECUTION-STEPS.md`/`SKILL.md` explicitly forbid rolling back or
   reposting on announcement failure.
9. Ledger fields required by `validate-ledger.py` for
   `graduate_announcements_sent`/`graduate_announcement_exceptions`
   (`credential_id`, `channel_id`, `thread_id`, `thread_url`, `sent_at`,
   branded `registrarUrl`) are all obtainable from `announce-graduate.sh`'s
   structured output.
10. No raw email, API key, token-bearing URL, undocumented endpoint, test
    post, issuance, or backfill found in the reviewed paths.

## Contracts checked

`announce-graduate.sh`, `test-announce-graduate.sh`, `registry.json` entry,
`groups/certifier/CLAUDE.md`, `groups/certifier/EXECUTION-STEPS.md`,
`src/certifier-prompt-contract.test.ts`, `heartbeat-grade-submissions/SKILL.md`,
`validate-ledger.py`.
