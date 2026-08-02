# NC-20260802-009 — Codex request for Claude C5 review R3

## Purpose

Review the correction for the production activation failure discovered after
R2 approval. Use the same Claude session, Opus 5, and maximum reasoning. This
round is focused but release-blocking: approve only if the exact legacy SQLite
migration now succeeds and the regression would have caught the observed
failure before deployment.

## Root and delta

- Review root: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Reviewed/committed NC-009 base:
  `d1bfccef1c5b6e49837ea668bdbfae207c0aec10`
- Review the complete uncommitted delta from that commit, including the factual
  activation/rollback record in continuity docs.
- Do not edit implementation or documentation. Write only
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R3.md`.

## Production evidence

The first activation attempt satisfied its documented preconditions: exact
archive/runtime verification, dry-run with exactly three changed plist paths,
one healthy listener, empty queue, and aggregate `SELECT COUNT(*) FROM
pending_sends` equal to zero. Target release integrity verified, then startup
failed three times with:

```text
SqliteError: no such column: action_id
at createSchema (.../d1bfcce.../dist/db.js)
```

The activator restored exact release `aa1c821`; health, one listener,
Slack/Gmail connectivity, empty queue, and old prompt hashes were re-verified.
No canary or customer email ran. The live database remained on this
structure-only pre-NC-009 schema:

```sql
CREATE TABLE pending_sends (
  draft_ts TEXT PRIMARY KEY,
  group_folder TEXT NOT NULL,
  chat_jid TEXT NOT NULL,
  thread_ts TEXT,
  recipient TEXT,
  lead_ref TEXT,
  approved_at TEXT NOT NULL,
  gmail_thread_id TEXT,
  handoff_observed_at TEXT,
  handoff_message_id TEXT,
  mailman_started_at TEXT,
  handoff_alerted_at TEXT
);
CREATE INDEX idx_pending_sends_group
  ON pending_sends (group_folder, approved_at);
CREATE INDEX idx_pending_sends_gmail_thread
  ON pending_sends (gmail_thread_id, approved_at);
CREATE INDEX idx_pending_sends_handoff
  ON pending_sends (handoff_observed_at, mailman_started_at, handoff_alerted_at);
```

## Proposed correction

The initial `createSchema()` SQL used the new-column `action_id` index before
the later `ALTER TABLE pending_sends ADD COLUMN ...` migration loop. Fresh test
databases did not expose that ordering defect because their `CREATE TABLE`
already contained every NC-009 column.

The correction removes `idx_pending_sends_action` from the initial schema block
and retains its existing creation after the additive NC-009 column loop. A new
test-only initializer reconstructs the exact old table and three indexes above,
calls the real `createSchema()`, then the regression proves a host action and
its append-only approval event can be recorded. The focused Node 22.23.2 DB
suite currently passes 66/66 tests, with typecheck, source formatting, and diff
whitespace clean.

## Required adversarial review

1. Reproduce or inspect the committed failure order and prove the correction
   makes every index/table statement legal on the exact old schema.
2. Confirm the fixture matches the production structure semantically and runs
   the real initializer rather than a duplicate migration implementation.
3. Check every statement in the initial schema block for any other index or
   constraint that references a column added only by a later migration.
4. Check repeat startup/idempotency on both fresh and legacy schemas, including
   a partially attempted but still pre-NC-009 database.
5. Confirm the fix neither weakens action-ID uniqueness nor permits a legacy
   row to execute without the content/recipient binding.
6. Check whether transactionality or failure cleanup is required for this
   additive, empty-table first activation, and identify any concrete remaining
   deploy blocker.
7. Audit the continuity record: it must say activation failed and rolled back,
   not imply deployment; no customer rows or secrets may appear.

## Deliverable

Return one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or `CHANGES REQUIRED`.
Include exact session/model/root/base, read-only limits, executable evidence,
blockers and follow-ups, and separate decisions for correction commit, rebuilt
release, production retry, and the still-unused single internal transport
canary. A green fresh-database suite alone is not evidence.
