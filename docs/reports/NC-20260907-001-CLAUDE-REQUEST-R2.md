# Narrow correction review

Sonnet/high. Read only this file and the current
`../../tools/contador/process-payment.cjs` lines 548-700 plus
`../../tools/contador/lib/product-identity.cjs` and
`NC-20260907-001-CLAUDE-RESPONSE-R1.md`. Write only
`NC-20260907-001-CLAUDE-RESPONSE-R2.md` here, then stop. No Bash/MCP/network or
other files. Four tool reads maximum. Material findings only; do not restate R1.

R1 reported no material findings. Codex independently noticed one unhandled
incomplete-evidence path: Checkout line product/price IDs are collected before
reading its PaymentIntent. If the optional PI/charge fetch failed, the broad
catch left `identityIncomplete=false`; a known native product could then route
without checking a contradictory metadata offer. The only correction replaces
that empty catch with `identityIncomplete=true`. The resolver already holds any
recognized route when incomplete, and preserves legacy behavior otherwise.

Verify this change closes that path without expanding provider authority or
blocking unrelated legacy products. The existing incomplete-evidence negative
test covers resolver refusal; root/focused tests are rerun. No price, metadata,
scope, assignment, financial, writer or communication policy changed.
