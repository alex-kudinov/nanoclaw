# NC-20260809-003 — CDP disconnect repair review, Claude R16

- Round: R16, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R16.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T02:52Z–03:14Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; live integration commit
  `f3c423c52f62850c4c52b2b76353d94b55247189`
- Change class: C0 bounded review of the CDP-disconnect repair. No production,
  database, browser, network, vault, or secret access; no `.env*`, credential,
  session, browser-profile, log, row, or task-payload content read; nothing
  implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION`.

---

# Verdict: GO for commit, immutable redeployment, and a repeat of shadow gate 1

The repair is correct, it is the minimal supported primitive, and I verified the
safety property that actually matters — **which R16 does not claim and which the
shadow could not have tested**: `Browser._close()` performs *no* context or page
teardown at all. It calls `browserProcess.close()` and nothing else. For a
`connectOverCDP` browser that callback is transport-close plus temp-directory
cleanup, with no OS process reference anywhere in it.

One Medium follows, and it is the same failure *shape* as H-4 in a rarer form:
`browser.close()` has no upper time bound. Not a blocker — it cannot occur on a
healthy transport and it is one line to bound.

The empirical result also stands on its own: the shadow failed **truthfully** on
`coaching`, closed both owned tabs, left Chrome healthy, wrote nothing, and then
hung — proving R14 H-4 exactly as predicted. That is the diagnostic working.

---

## 1. Playwright close semantics, verified from installed source

`FACT`. `node_modules/playwright-core/lib/coreBundle.js:42832` —

```js
const closeAndWait = async () => await chromeTransport.closeAndWait();
```

`FACT`. `:42850-42855` —

```js
const doClose = async () => { await closeAndWait(); await doCleanup(); };
…
const browserProcess = { close: doClose, kill: doClose };
```

The `browserProcess` handed to `CRBrowser.connect` holds **no OS process
reference**. `close` and `kill` are the same callback, and neither can signal,
terminate, or otherwise reach the launchd-owned Chrome. R16's claim is exact.

`FACT` — the stronger property, which is the real safety question and which
R16 does not assert. `Browser._close()` at `:52363-52373`:

```js
async _close(options) {
  if (!this._startedClosing) {
    if (options.reason) this._closeReason = options.reason;
    this._startedClosing = true;
    await this.options.browserProcess.close();     // the only action
  }
  if (this.isConnected())
    await new Promise((x) => this.once(_Browser.Events.Disconnected, x));
}
```

It does **not** iterate `contexts()`, does not close pages, and issues no CDP
target-close command. `didClose()` (`:52349-52360`) runs on the disconnect event
and only performs client-side bookkeeping — `context.browserClosed()`, finishing
download artifacts, emitting `Disconnected` — after the transport is already
gone.

`INFERENCE`. This is what makes the repair safe rather than merely observed-safe.
The concern with `connectOverCDP` is that the returned browser is constructed
with a `persistent` context (`:42856-42859`) that, for an attached Chrome, *is*
the user's existing context. If `close()` tore down contexts, it would close the
operator's tabs. It does not. `browser.close()` here is transport-close only.

`FACT` — a bonus the repair earns that neither side has claimed: `doCleanup`
also removes `artifactsDir`, a `mkdtemp` directory created per connection
(`:42841-42843`). Before this change — and in the observed shadow, where the
process was interrupted — that temp directory leaked on every run. The repair
closes a latent disk leak as well as the handle leak.

---

## 2. Is there a smaller or safer supported disconnect? — No

`INFERENCE`, from the same source:

- **`browser.close()`** is the only public disconnect Playwright exposes for
  `connect()`/`connectOverCDP`; there is no separate `disconnect()` method. Per
  §1 it reduces to `chromeTransport.closeAndWait()` plus temp cleanup. This is
  the minimum.
- **`context.close()`** would target the persistent default context, which for
  an attached Chrome is the operator's own context. Strictly more dangerous, and
  correctly not used.
- **Reaching internals** (`browser._connection`, the transport object) is
  unsupported, unversioned, and would defeat the point of pinning a dependency.

The chosen call is both the smallest and the safest available.

---

## 3. Cleanup and error behavior

`FACT`. `src/procurement-browser-port.ts:457-467` closes both owned pages with
`Promise.allSettled` first, then awaits `this.browser.close()`. Page closes
therefore cannot prevent the disconnect, which is the right order: the handle
that kept Node alive is released even if a page close fails.

`FACT`. The sole caller is `collectCaleProcure`'s
`finally { await port.close().catch(() => undefined) }`
(`src/procurement-caleprocure-collector.ts:280-282`), so a throw from
`browser.close()` cannot mask the underlying collection error or the partial
receipt.

### M-9 · `browser.close()` is unbounded · Medium, non-blocking

`FACT`. `_close` (`:52371-52372`) awaits `Disconnected` with **no timeout** when
the browser still reports connected. No timeout parameter is threaded through
`connectOverCDP`.

`INFERENCE`. On a wedged transport — the socket alive but the peer unresponsive
— `browser.close()` never settles. Because `port.close()` runs inside the
collector's `finally`, it is **outside** the `abortable()` wrapper and outside
the job's 80% internal deadline, so the process would hang past that deadline
until SIGTERM/SIGKILL. That is the H-4 shape again, in a rarer form.

`RECOMMENDATION` — bound it, one line, no behavior change on the healthy path:

```ts
await Promise.race([
  this.browser.close(),
  new Promise<void>((resolve) => setTimeout(resolve, 10_000).unref()),
]);
```

The `unref()` matters: an un-unref'd timer would itself hold the loop open. Not
required before this shadow — a wedged transport has not been observed and the
gate below will catch a hang immediately — but I would not carry it into live.

---

## 4. Test sufficiency

`FACT` — `REPRODUCED`: `npx vitest run` over the three focused files →
**14 tests / 3 files pass** (collector 8, browser-port 5, job 1), matching
R16's count exactly.

`FACT`. The new case constructs the port via `Reflect.construct` with fake
pages and a fake browser and asserts `searchClose`, `detailClose`, and
`browserClose` are each called exactly once.

`INFERENCE`. Adequate **for this repair**: the claim under test is "the client
close is invoked exactly once, after both page closes," and that is what it
proves. Two things it deliberately does not and cannot prove, which is why gate
1 remains empirical rather than satisfied by this test:

- that the real Playwright `close()` releases the last libuv handle;
- that the launchd Chrome and its pre-existing tabs survive.

§1 establishes the second from source with high confidence; only a live run
establishes the first. The `Reflect.construct` reach-around into a private
constructor is acceptable here — it is the seam that avoids requiring a browser
— but it means the test cannot detect a change in the real close contract if
Playwright is upgraded. Worth one line in the test noting that the pin, not the
test, is what guards that.

---

## 5. Next empirical gate — unchanged and restated

**Gate 1, in order, on the redeployed immutable release:**

1. The collector process **exits on its own**, with no interruption, and its
   exit code reflects the run.
2. **Launchd Chrome remains alive and healthy** after the process exits.
3. **Tabs return to baseline** — the two owned tabs closed, the pre-existing two
   remaining.

`INFERENCE`. Gate 1 may be satisfied by a *failing* run: the observed
`coaching` failure is a legitimate vehicle, since what is under test is process
teardown, not collection success. Prove teardown first, then chase the search
failure.

**Then, unchanged from R14 §6 / R15 §5:**

4. **Three consecutive complete 9/9 shadow runs**, each inside 50% of
   `timeout_ms`, with the baseline non-zero and `extractedRows === resultCount`.
5. **Two units with different result totals produce different observations** —
   the B-1 disproof, still non-negotiable.
6. **No unit reports `reconciliation_failed`** — if one does, that is the
   pagination evidence M-3 predicted and `pagesVisited: 1` must be revisited
   before live.
7. `facilitation` yields event `0000039985` with BU `3820`; an induced failure
   preserves earlier units; no Chrome tab growth across the three runs.

**Live** is unchanged: one `complete` receipt, nine observed units, zero
missing; `0000039985` present with no operator assistance; a `complete`
nine-unit zero-row run while that event is visible remains **forbidden**; review
gate stays `0`.

`INFERENCE`. The `coaching` search failure is now the leading candidate for
what gate 4 must clear, and it is exactly the class M-8 anticipated — a busy
transition that did not appear within the 5 s window, or a control that was not
uniquely visible. The diagnostics and the per-unit failure model added in R15
mean the next run should say which.

`INFERENCE`. Event `0000039985` closes **2026-08-13**. Gates 4–7 and the live
positive control must land inside that window or be re-established against
whatever is then open.

---

## 6. Commands, files, limitations, time, cost

### Commands

| Command | Result |
| --- | --- |
| `npx vitest run` × 3 focused files | `REPRODUCED` — **14 tests / 3 files pass** |
| `git log --oneline`, `git status --porcelain`, `git diff -- src/procurement-browser-port.test.ts` | Read-only |
| `grep`/`sed`/`awk` over `node_modules/playwright-core/lib/coreBundle.js` | Read-only; `:42810-42884` and `:52348-52375` |
| `ls`, `find`, `wc`, `date` | Read-only |

Files read this round: `src/procurement-browser-port.ts` (`close`),
`src/procurement-browser-port.test.ts` (new case),
`src/procurement-caleprocure-collector.ts` (`finally` caller),
installed `playwright-core@1.62.1` bundled source, and the R16 request.
Everything else is carried from R13–R15 and was not re-read.

### Limitations

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so I
did not run `npm run typecheck`, `format:check`, or the full suite; those remain
Codex's to attest. The three focused files have no native dependency and ran
under ambient Node v26.6.0.

`FACT`. Playwright is distributed here as a single 3.4 MB bundle
(`lib/coreBundle.js`) rather than per-module sources, so my citations are line
offsets into that bundle. They are exact for this installed version and will not
survive an upgrade — which is itself the argument for treating the version pin
as the contract (§4).

`FACT`. No CDP endpoint was reachable from this review, so gate 1 remains
empirically open by design.

### Response file

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R16.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

### Owner decisions

**No new owner decision, and none introduced by this repair.** OD-5 remains
resolved; OD-4 is answered by execution pending the live gates; **OD-1**,
**OD-2**, **OD-3** remain open, migration-116-scoped, fail-closed, and
untouched.

### Elapsed time and cost

Approximately 22 minutes wall-clock, 2026-08-10T02:52Z–03:14Z: reading the
repair and its test, tracing the Playwright close path through the installed
bundle, one focused test run, and one file write. This CLI wrapper exposes a
cumulative session budget rather than a per-round figure; it read **$11.0 of
$15** immediately before this write, so this round's marginal cost is not
separately observable and is not estimated.
