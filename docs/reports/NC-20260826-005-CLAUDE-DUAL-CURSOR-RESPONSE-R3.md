# NC-20260826-005 dual-cursor correction review response R3

Reviewed only the four allowed artifacts plus the request. No files edited, no
Bash/web/MCP/provider tools used, no other file inspected. R2's accepted
Stripe/contact/privacy findings were not reopened.

## Finding — jumping the cursor to a `MAX(id)`-snapshotted head, rather than to
the last row actually observed, can permanently skip a Chaos interaction or
inbox row that commits out of numeric-ID order

- File/function: `src/relationship-context-source-enrichment.ts:1452-1483`
  (`interactionHead`/`inboxHead` snapshot queries and the bounded
  `interactionChanges`/`inboxChanges` selects) and `:1718-1726` (`nextCursor`
  construction inside `ingestChaosVerifiedLedgerWithClient`).
- What changed vs R2: the dual-cursor design correctly removes the
  full-history `GROUP BY` on every tick — `interaction_rows`/`inbox_rows`
  (`:1505-1535`) now aggregate only the bounded `changedVisitorIds` set via
  the `(source_provider,source_id)` index and exact stable event IDs, exactly
  as R2's smallest-acceptable-correction asked. That part is correct.
- What is not fixed: when a page is `complete` (`interactionChanges.rows.length
  <= perSourceLimit`, `:1484`), the cursor advances not to the highest row ID
  the query actually returned, but to `interactionHeadId`/`inboxHeadId`
  (`:1720-1725`) — the result of a separate, earlier `coalesce(max(id),0)`
  statement (`:1453-1460`) against the live table. `business_v2.interactions`
  and `business_v2.webhook_inbox` are bigserial-keyed tables written by
  multiple concurrent host paths (Trafft, contact-form, Chaos, WordPress
  interactions per `docs/RELATIONSHIP-CONTEXT-STRIPE-CONTACT-CHAOS.md:41-42`,
  plus whatever else writes `webhook_inbox`). Postgres assigns sequence values
  at `nextval()` time, before commit, so two concurrent transactions can
  commit out of ID order: a transaction holding a lower `id` (e.g. 100) can
  still be in flight — uncommitted and therefore invisible to this read —
  while a transaction holding a higher `id` (e.g. 101) has already committed
  and is visible. `MAX(id)` in that window returns 101. The bounded change
  query then reads `id>cursor AND id<=101`, finds no row at 100 (not yet
  visible), reports the page `complete`, and the cursor jumps straight to
  `101`. When the id=100 transaction finally commits, it is now below the
  cursor and is **never selected again** — `WHERE id>101` on every future
  tick permanently excludes it, whether or not it is a Chaos-sourced row.
  This is a standard, well-documented failure mode for sequence-based
  incremental cursors that snapshot `MAX(id)` as a safe upper bound instead
  of bounding by a value known to be fully settled (age margin, `xmin`
  snapshot horizon, etc.); nothing in this correction adds such a margin.
- Why this is a new, R3-specific gap rather than an already-accepted pattern:
  `ingestContactFormLedgerWithClient` (`:1236-1245`, not itself in the R3
  correction) never jumps past a row it did not observe — its cursor always
  advances to `lastRow?.id` (`:1380`), an ID that was actually read from a
  committed row, or stays put if no rows matched. It can rescan a dead range
  repeatedly, but it cannot skip a row. Chaos's dual cursor deliberately
  trades that safety for the "avoid rescanning unrelated later rows"
  optimization the correction describes (`docs/RELATIONSHIP-CONTEXT-STRIPE-
  CONTACT-CHAOS.md:135-137`), and in doing so introduces the skip risk that
  contact-form's simpler cursor does not have. This is exactly the mechanism
  under review in this R3 packet, not a reopening of the R2 contact-form
  finding.
- Realistic failure mode: a Chaos webhook-inbox row or interaction row that
  loses a commit race against a concurrently-written row from any source (not
  necessarily Chaos) is silently dropped from all future ticks. `complete`
  and the health counters report a clean drain; nothing surfaces the gap.
  Given a 15-minute unref'ed timer running indefinitely against a live,
  multi-writer business database, the probability of at least one such
  interleaving over the service's lifetime is not negligible, and the effect
  — a Party that should have received `attribution.chaos.verified_visitor@1`
  never does, with no error code, no retry, no health flag — is a durable,
  silent correctness loss the corrected design's own goals (bounded but
  complete drain) claim to avoid.
- Not exercised by the cited evidence: the disposable-PostgreSQL 4/4 proof
  inserts fixture rows synchronously on a single connection before each
  ingest call, so no interleaved-commit ordering across the snapshot boundary
  is possible in that harness; it cannot observe this race either way.
- Smallest acceptable correction: don't trust an instantaneous `MAX(id)` as
  a safe upper bound. Bound the snapshotted head to a value guaranteed fully
  settled — e.g. cap it by transaction age (`id` as of `now() - <margin>`,
  large enough to exceed any realistic in-flight transaction duration) or by
  a `txid_snapshot_xmin`-style horizon — so the cursor only ever advances past
  IDs whose writing transactions are guaranteed already committed.

Report only a still-material correctness, skip/replay, scale, or privacy
defect in this dual-cursor correction with exact evidence, per the request.
The finding above is that defect; no other material issue was found in the
allowed packet.
