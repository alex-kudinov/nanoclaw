# NC-20260802-009 — Codex request for Claude C5 deployment-record review R4

## Purpose

Perform the final independent review of NC-009's corrected production
activation, single internal Gmail transport canary, and shared operational
record. Use the same exact Claude session, Opus 5, and maximum reasoning. This
is a documentation-only commit boundary: the implementation and migration
correction were already approved in R2/R3 and committed as `d1bfcce` plus
`e1fa93e`.

## Root and limits

- Review root: `/private/tmp/nanoclaw-sequence.oUOHVX/worktree`
- Current committed implementation: `e1fa93e09f6dedf363c9a8c0be1723583563f533`
- Review the uncommitted documentation delta from that commit.
- Do not edit implementation or existing documentation. Write only
  `docs/reports/NC-20260802-009-CLAUDE-C5-REVIEW-R4.md`.
- Treat the production evidence below as operator-captured evidence; do not
  perform a send, service mutation, database write, OAuth change, or cleanup.

## Corrected release and activation evidence

- Release commit: `e1fa93e09f6dedf363c9a8c0be1723583563f533`
- Source-tree digest: `7ade520429963e29e5d050da0b105bf7d2497b2b`
- Artifact digest: `de470dd842a6443bb21fa95e3f827afb240324c3f50e35385ceb3cd21337c24a`
- Archive SHA-256:
  `e99cca9e13f8b35d9070ecfc444a79a66807db7a6814b06d1cfb66b6c69500b0`
- Bundle size: 520 files; local independent unpack verification, production
  transfer hash, bundled verifier, zero-row precondition, live prompt hashes,
  and exact-three-field activation dry-run passed.
- Apply changed prior exact release `aa1c821` to `e1fa93e`. No-cache health,
  launchd, and listener inspection converged on PID 68877 under Node 22.23.2.
  Health reported matching commit/code root/source tree/artifact, Slack and
  Gmail connected, queue depth zero, zero active/waiting containers, and no
  circuit-breaker state.
- Live SQLite aggregate checks after activation and again after the canary:
  zero `pending_sends`, zero `email_send_events`, and zero executing/uncertain
  actions. The NC-009 action/event indexes are present.

## Canary evidence and environment discovery

The immutable release contains no `.env`. A non-sending preflight from the
release root therefore found all four Gmail settings absent. To avoid mutating
the verified release or copying secrets, the operator created one private
temporary working directory, linked its `.env` to the existing operational
environment, copied only the activated release manifest into `dist/`, and ran
the absolute activated canary binary under the pinned Node. A second
non-sending preflight reported only Boolean credential presence and exact
release identity.

The one authorized fixed-content canary then ran exactly once and returned:

```json
{
  "ok": true,
  "messageId": "19fc4d33ccf3061e",
  "threadId": "19fc4d33ccf3061e",
  "recipientSha256": "a25b480c540d47711e9892cf5319e34bd91e430b7fe85cce306c30b90580df31"
}
```

The command retrieves the exact Gmail message before success. No customer
recipient, Slack post, action/business row, prompt-selected recipient, BCC,
OAuth change, or retry occurred. Cleanup removed the exact environment link,
manifest copy, generated canary log, and temporary directories. Post-canary
health and aggregate database checks remained clean.

## Required review

1. Reconcile the new claims across `docs/ACTIVE-WORK.md`,
   `docs/ENGINEERING-CHANGELOG.md`, `docs/PROJECT-MAP.md`,
   `docs/RELEASE-INTEGRITY.md`, and the convergence state.
2. Confirm the state remains `deployed_unverified`, because the canary proves
   Gmail transport/OAuth receipt only; it does not validate a natural approved
   customer action, inbox placement, or business logging.
3. Confirm the first `d1bfcce` activation failure and automatic rollback remain
   prominent and are not overwritten by the successful corrected activation.
4. Check that no secret value or customer address is present and that the
   Gmail identifiers/recipient hash are suitable durable receipt evidence.
5. Review the temporary environment bridge/runbook wording for safety and
   reproducibility. Flag any command that would execute the JavaScript without
   pinned Node, mutate an immutable release, print credentials, or encourage a
   retry after ambiguous Gmail acceptance.
6. Confirm NC-010 records the missing first-class environment/manifest binding
   and that the next action is a natural, not synthetic, approved send.
7. Identify any factual contradiction, overclaim, missing rollback fact, or
   continuity-check problem that must block the documentation commit.

## Deliverable

Return one verdict: `APPROVE`, `APPROVE WITH FOLLOW-UPS`, or `CHANGES REQUIRED`.
Include exact session/model/root/base, review limits, file-by-file findings,
whether the documentation commit may proceed, and the remaining natural-send
outcome boundary. Do not re-review or alter the already approved code unless a
documentation claim is directly contradicted by it.
