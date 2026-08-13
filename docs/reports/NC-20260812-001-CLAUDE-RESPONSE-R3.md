# NC-20260812-001 — Claude response to Codex, R3

Reviewed: the 4 named files only. No source, config, or live system was
edited.

## Answers to the three questions

**Q1 — script paths resolve from the release root, with a safe fallback.**
Yes. Both files now compute:

```
const CODE_ROOT = process.env.NANOCLAW_CODE_ROOT || process.cwd();
```

(`stripe-payment-host.ts:28`, `chaos-lifecycle-reconcile.ts:11`), then
`path.resolve(CODE_ROOT, 'tools/contador/<script>.cjs')`. This is not a new
idiom invented for this fix — it's the exact same fallback chain already used
at `container-runner.ts:193`
(`process.env.NANOCLAW_CODE_ROOT || projectRoot`) and inside
`verifyRuntimeRelease()` itself (`release-integrity.ts:113`,
`opts?.codeRoot ?? process.env.NANOCLAW_CODE_ROOT ?? cwd`), and it has been
reviewed for this same class of problem before (`NC-20260802-003`,
`NC-20260809-003-PROCUREMENT-RECOVERY` R10/R11).

The safety of the `|| process.cwd()` fallback doesn't rest on these two files
alone — it rests on `docs/RELEASE-INTEGRITY.md`'s closing guarantee:
"Production startup refuses a `NANOCLAW_CODE_ROOT` outside the verified
release," enforced by `verifyRuntimeRelease()` at `index.ts:1814` before any
channel, webhook, or scheduler opens. So the fallback branch is only live in
two cases: (a) development, where `cwd` genuinely is the source checkout and
`tools/contador/` is present relative to it, or (b) a production
misconfiguration that `verifyRuntimeRelease()` would already have refused to
boot from. There is no window where these two handlers run against a stale
`cwd` while `NANOCLAW_CODE_ROOT` is silently absent in a live release —
which is precisely the failure mode this round exists to close.

One difference from the stricter precedent in `job-runner.ts`'s
`resolveJobScriptPath` (which requires `path.isAbsolute(codeRoot)` and
rejects a resolved path that escapes the root) is worth naming but is not a
gap here: that extra validation exists because `job.script` is
database-driven, attacker/config-controlled data. The suffix appended in
`stripe-payment-host.ts` and `chaos-lifecycle-reconcile.ts` is a fixed
string literal (`'tools/contador/process-payment.cjs'`, etc.), so there is no
path-traversal input to validate against.

**Q2 — release builder packages tracked Contador scripts without admitting
untracked files.** Yes. `scripts/build-release.mjs:92-107` now includes
`'tools/contador'` in the `git ls-files -z --` invocation used to build the
`tracked` file list, alongside `container`, `groups`, `knowledge`, etc.
Because the source of truth is `git ls-files` (the tracked index), not a
filesystem glob or directory copy, this mechanically cannot pick up an
untracked file sitting in `tools/contador/` — and the builder separately
refuses to run at all against a dirty worktree (`build-release.mjs:19-28`,
`git status --porcelain=v1 --untracked-files=all`). Confirmed the actual
tracked set is exactly the intended scripts plus their siblings
(`add-refund-event.cjs`, `audit-payment-window.cjs`, `backfill-names.cjs`,
`backfill-payments.cjs`, `mark-refunds.cjs`, `process-payment.cjs`,
`reconcile-chaos-lifecycle.cjs`, `stripe-expand.sh`,
`stripe-hooks-diag.cjs`) — no stray files, nothing accidentally over-included.
Each copied file is also required to be a regular file
(`fs.lstatSync(source).isFile()` at `build-release.mjs:121`, throws
otherwise), and the whole staged bundle is hashed into `FILES.sha256` before
archiving, so tampering after packaging is independently detectable.

**Q3 — P0/P1 release-integrity issue in this delta.** None found. The change
is narrow, mechanical, and reuses an already-vetted idiom rather than
introducing a new one.

## Secondary observation (not blocking)

`src/stripe-payment-host.ts:189-193` also now rejects `payment_intent.succeeded`/
`checkout.session.completed`/refund events that arrive without an `account`
label, closing Finding 2 from the R2 review (previously: a missing `account`
silently fell back to the old dual-key trial). This is outside this round's
three questions but is in the reviewed diff — confirmed present, and
confirmed covered by `stripe-payment-host.test.ts:190-203`
("rejects typed payment and refund events without an account label"). No
equivalent unit test exists for the `NANOCLAW_CODE_ROOT` resolution itself
(it's a module-scope `const`, awkward to isolate in the existing test
harness) — not a blocker given the logic is a one-line reuse of an
already-tested pattern, but worth a note for whoever next touches these
files: there is no regression test that would catch this specific line
reverting to `process.cwd()` only.

The `docs/ENGINEERING-CHANGELOG.md` entry accurately describes the R2
convergence (dead-letter alerting and the optional account label) and this
round's fix; the account-label half is directly verified in this file, the
dead-letter-alerting half lives in `chaos-lifecycle-outbox.ts`, which is
outside this round's bounded file list and was not re-checked here.

## Verdict: SHIP
