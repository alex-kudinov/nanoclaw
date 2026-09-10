# Bounded independent adapter review

Review exactly these three files once:
- `src/student-enrollment-ingress.ts`
- `src/student-enrollment-ingress.test.ts`
- `docs/STUDENT-ENROLLMENT-INGRESS-ADAPTERS.md`

Write material findings with exact references/reproductions, or NO MATERIAL
FINDINGS, to `docs/reports/NC-20260906-007-CLAUDE-RESPONSE-R1.md`, then stop.
Read/Write only; write only that response. No other source reads, Bash, web,
MCP, network, .env, credentials, session stores, real records, production or
provider access. Stay under eight tool calls. About 45k characters of inputs.

Accepted scope: local synthetic normalized-snapshot adapters for the eight
foundation channels, producing canonical engine state/outbox or owned exceptions.
No network authentication/retrieval, database persistence, runtime wiring,
real-data/history replay/reconciliation, deployment, provider/Sheet writes,
payment/refund or communication. The eighth migration/correction route explicitly
produces an owned resolution case; ordinary new operator orders use the actual
funding/grant route. Do not reopen the excluded production activation slice.

Independently inspected/tested predecessor mechanics (do NOT re-read engines):
- applyBookkeeperFundingReceipt is pure and uses a trusted host authority hash
  plus catalog/Party facts. Invalid canonical source/channel, offer, funding,
  participant, or class gates create canonical owned exceptions. Malformed
  envelopes throw with no mutation. The function itself does not authenticate
  providers or host roles; this adapter supplies the independently verified
  normalized proof boundary while external authentication remains future work.
- Source tuple scope/type/ID hashes to bookkeeper:<hash> orderKey. Exact receipt
  replay compares immutable order admission evidence; altered fully attested
  receipts open source conflict and hold queued/failed projections. Recorded
  conflict retries are no-ops even after resolution. Unattested conflicts cannot
  mutate an existing order.
- Orders/seats/finance/entitlements/class assignments/exceptions/evidence/outbox
  are existing canonical state, no new parallel database. Full payment/grant
  semantics and payer/participant consistency are enforced there. Unnamed seats
  can retain actual funded class commitments while valid sponsor slots progress.
- Capacity commitments count paid promises even when full; overage opens an
  owned exception and cannot create a class assignment/projection. Assignments
  consume commitments. Duplicate people in a class are held. Future classes are
  pending. Projection status starts queued; exact readback is separate.
- captureOrder, attachEnrollmentEvidence, openEnrollmentException and
  linkSourceReference clone state and enforce stable keys/version binding.
  Source aliases cannot bind to multiple orders. Evidence is append-only by key.
  Resolving exceptions retains their terminal records. None has external effects.

Review the NEW code for evidence/role bypass, payload binding, cross-account or
alias collisions, replay after later changes, incomplete redeliveries disturbing
valid prior enrollment, partial sponsor/class evidence, quarantine ownership,
privacy minimization, and atomicity of the returned aggregates on failures.
The proof registry and catalog are trusted HOST arguments, never candidate or
AI fields. Hashing a proposal alone cannot populate that registry. Whether a
future HTTP caller enforces this is excluded, explicitly documented work.

Verification: focused tests cover the new adapter and reviewed predecessors;
initial typecheck passes. Full root currently has only two unchanged baseline
failures (CNPC wrapper-literal and date-sensitive Trafft), already reproduced
on the predecessor in NC-006. All fixtures here are synthetic. Do not speculate
about unrelated runtime changes; report material reproducible adapter findings.
