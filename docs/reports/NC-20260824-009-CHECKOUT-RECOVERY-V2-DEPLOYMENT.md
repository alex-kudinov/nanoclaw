# NC-20260824-009 checkout recovery v2 deployment

Date: 2026-08-25
State: prospective production active; first natural outcome pending

## Review and corrections

- Claude plan R1 found four architecture gaps; corrected plan R2 separated
  per-touch state and added late-metadata, locale, and sibling-purchase safety.
- Implementation R2 found ambiguous crash replay and a missing touch-one gate.
  Both were fixed; R3 returned no material findings.
- The first internal render probe proved Encharge event-property merge tags
  render blank in this account. The flow was disabled immediately. Reliable
  privacy-minimal person fields were added for public product name and safe
  return URL only. Claude R4/R5 found two concurrency issues; a single global
  transaction-scoped claim lock closed them and R6 returned no material
  findings.

## Exact releases and backups

- NanoClaw live commit: `61b12648839c5b61a5be4ced1c0bfc1508c5e51e`
- Source tree: `9b2ecb92e4031c458054f270ec706c008c0ab7ca`
- Artifact SHA-256: `c0d08bcd9e12af9d355fb158f7c49a9cabe91f2f173dfd3b5ffddbd18086a001`
- Archive SHA-256: `28df645e26eeb23bf48696be64924301b4ed8ce5ff80927533c34d915265b9f1`
- Artifact files: 948; Node: 22.23.2
- Migration backup:
  `~/.local/share/nanoclaw-deploy-backups/NC-20260824-009-20260824T235259Z`
- PostgreSQL dump SHA-256:
  `608f64a3635286f2def1f056ab99f965b1c28f0e0f5c4f4d76c8cf0d75825718`
- SQLite backup SHA-256:
  `dc743ca544618284e748fcb3fe716bf983096009b5efcb49c8402e32cbee18ca`
- Production env backup:
  `/Users/xbohdpukc/dev/NanoClaw/.env.backup-checkout-production-20260825T012711Z`

Migration 136 created two empty admin-only send tables, three context columns,
zero non-admin grants, and retained the empty-only rollback boundary.

## Provider and delivery proof

- Tandemweb runtime commit: `101b9d9c91b02397f530c5ce1539996227d3f33a`
- Public checkout JavaScript shows localized `up to two reminders` consent and
  posts locale plus a same-origin return URL.
- n8n workflow `checkout-recovery-website-shadow` is active, retention-free,
  and forwards product name, locale, and return URL.
- Encharge templates: `479523`-`479530`, category `251170`.
- Encharge flow `400441`: active, 20 active steps, 12 links, eight exact
  locale/touch branches.
- Corrected internal touch one and touch two were each received exactly once
  with exact ACC subject/product. Both tracked buttons resolved HTTP 200 to the
  canonical ACC page. Replaying touch one kept the received count at one.
- All nine entry steps across legacy flows `366146`, `366150`, `366152`,
  `366153`, `391846`, `399379`, and `399380` now use unique unproduced
  `legacy-retired-checkout-*` events. Flows stay on to drain prior entrants.

## Production boundary

Production cutoff: `2026-08-25T01:27:11Z`. Health proves exact release,
production send mode, connected Gmail/Slack, one listener, empty queues,
healthy student lifecycle, and unchanged 273-line error baseline. At cutover
there were four accepted intents belonging only to the two internal pilot
cases, zero Heartbeat intents, and zero post-production-cutoff cases.

No historical outreach, synthetic purchase, payment/refund, accounting, CRM,
booking, roster/access, or required-student-message mutation occurred. The
remaining outcome is the first natural post-cutoff consented abandonment and
its exact send or suppression disposition.
