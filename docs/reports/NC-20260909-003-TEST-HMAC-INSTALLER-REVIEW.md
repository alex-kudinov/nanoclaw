# Private TEST HMAC installer review

Two bounded fresh Sonnet/high rounds used actual Read,Write tools and strict
empty MCP config. R1 e32f8c6d-b467-4c03-b9aa-e4aeb727d7cd accepted. Codex
independently reproduced partial temporary-write residue, moved the write inside
cleanup, used the already-ignored `.tmp-*` prefix, and explicitly synced backup
directories before replacing the env. Eight synthetic fixture tests now pass.
R2 ba513982-2e76-4119-a4d1-1475d575b901 accepted the narrow correction with no
material remaining finding. The redundant backup-child fsync is harmless.

Earlier development checks fixed legacy singular HMAC shadowing and preservation
of matching quoted fixed settings. Apply requires exact host, exact allowed env
path,0600 regular file, no existing HMAC, no conflicting/duplicate target field,
private backup, nonblocking lock and final bytes/identity comparison. Hidden TTY
input fails closed rather than echoing. No restart or provider request is made.

Root ran py_compile, all8 fixtures and real Peri-path dry-run (no prompt or write).
No real key was generated or installed by this review. Source SHA256:
`d26c48a6c27e57314870b6c94423636c6daebafa9d97e422072c9bcefc2aab6b`.
Test SHA256:`b05b01fd50fc0558a85df4b10c116af9708bea80a9992f474beacfba0d1851fd`.

Full request/response/usage receipts are retained in the durable Peri workspace
`/Users/xbohdpukc/dev/peri/output/shared-test-webhook/INSTALLER-*-R*.md`.
R1 usage:4 calls, input8, cache creation43724, cache reads113255, output14174,
max context53611, reported cost0.339303; no warnings. R2 usage is recorded in
Peri's final evidence alongside the independent filter review.
