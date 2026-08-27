# NC-20260826-005 dual-cursor correction review R3

Review only the residual R2 Chaos scale correction. Do not reopen accepted
Stripe/contact/privacy findings, edit implementation, use Bash/web/MCP/provider
tools, or read any other file. Write only:

`docs/reports/NC-20260826-005-CLAUDE-DUAL-CURSOR-RESPONSE-R3.md`

Allowed reads:

1. `docs/reports/NC-20260826-005-CLAUDE-CORRECTION-RESPONSE-R2.md`
2. `src/relationship-context-source-enrichment.ts`
3. `src/relationship-context-store.integration.test.ts`
4. `docs/RELATIONSHIP-CONTEXT-STRIPE-CONTACT-CHAOS.md`

## Exact correction

Chaos no longer groups the complete historical ledgers before filtering.

- One versioned JSON watermark stores two bigint positions: the global
  `interactions.id` position and global `webhook_inbox.id` position.
- Each tick snapshots the current global head in both tables.
- It selects at most half the configured page budget from each source between
  the saved cursor and snapshotted head, ordered by the underlying numeric table
  column (`i.id`, `w.id`) rather than the text-cast output alias.
- If a source page overflows, its cursor advances only to the last selected
  numeric ID. If it is complete, the cursor advances to the snapshotted global
  head, avoiding repeated scans of unrelated later rows.
- The selected rows yield a bounded changed-visitor set. Full interaction
  evidence is then grouped only for those visitor IDs using the existing
  `(source_provider,source_id)` index. Inbox evidence uses exact stable Chaos
  event IDs plus the small legacy null-event fallback.
- Evidence writes and both cursor advances remain in the same transaction.
- Health reports selected interaction/inbox change counts, deduplicated changed
  visitor count, durable exact/legacy/conflict totals, and completeness.
- The malformed visitor remains hashed terminal legacy.

## Independent evidence

- Pinned Node 22.23.2 format/typecheck/build: pass.
- Disposable PostgreSQL 4/4: a forced two-item budget drains three interaction
  and three inbox changes across bounded ticks, records exact/mismatch/malformed
  outcomes, then reaches a stable zero-row replay.
- The integration test caught and corrected one numeric-ordering defect where
  `ORDER BY id` resolved to the text alias and ordered 10 before 8/9; queries now
  order explicitly by `i.id` and `w.id`.
- Full root: 3,310 pass / 29 skip with the sole known unrelated CNPC wrapper
  assertion.
- No production/provider mutation occurred.

Report only a still-material correctness, skip/replay, scale, or privacy defect
in this dual-cursor correction with exact evidence. Otherwise write
`NO MATERIAL FINDINGS`.
