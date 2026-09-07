# NC-20260907-006 supervision checkout source correction

Status: accepted current-source reconciliation; implementation staged

The NC-005 preparation branch `0e42c7dd2c27` retained the July 22 launch
shape: inaugural active and regular inactive. Current deployed Tandemweb/main
is `c61fabf84f45`. Its source and live server checkout both show inaugural and
regular active.

The introducing commit is `fbce5638da96b361a47754be9bea959abdad2ed4`, “Add
cohort selection to MCS and AACS checkout.” Its bounded accepted scope and
independent Claude review establish the intended semantics:

- inaugural is active only for cohort start `2026-10-07`;
- regular is active for later cohorts and excludes `2026-10-07`;
- both require `cohort_program: supervision` and a server-validated cohort;
- prices remain USD 399,600 / 479,600 cents and installments remain four
  obligations of 99,900 / 119,900 cents; and
- both retain the same Heartbeat program group. This is checkout eligibility,
  not Heartbeat attachment, learner access, or completion evidence.

Therefore NC-006 updates the current supervision fact catalog, its deterministic
minion pack/validators, publication generator, and Tandemweb static consumer to
the reviewed current behavior. The original NC-004/NC-005 snapshots and review
reports remain unchanged historical evidence. No live website availability is
changed by this correction.

The Mini's installed NanoClaw release resolves `PRODUCTS_JSON_PATH` to the
default `/Users/xbohdpukc/dev/tandemweb/data/checkout/products.json`. That
operational mirror is stale: inaugural is active without cohort fields; regular
is inactive without cohort fields. The Mac Studio copy is also stale. Syncthing
folder `dev-tandemweb` is active on Studio and paused on Mini, so no automatic
concurrent write is currently expected, but a later unpause could conflict.
Syncthing's file-level debug read confirms divergence rather than quiescent
replication: Studio and Mini each report global equal to local, but their block
hashes and vector versions differ; Mini reports no current availability. The
same folder ID means these are configured replicas even though the paused Mini
currently treats its older version independently.

The guarded repair helper
`scripts/reconcile-supervision-checkout-source.mjs` refuses any selected-field
edit or whole-file hash change, preserves every byte outside the two selected
objects, proves every other parsed field unchanged, writes a mode-0600 backup,
and performs atomic write/readback only with exact host confirmation.

Dry-run receipts:

- Studio: whole file `e7dc68f42709feaf1643971363c264bd73ec7d17c61fb64128b42890f5369011`
  to proposed `8dbc84f72ac979475851837e9f7b6fe8a28a48be146af8d50b8654b8b9b444c4`;
  unchanged nonselected-byte digest
  `9a10cf4b4e43ff1907adc5f5927959315445e9b701363a86473f481c44d68365`.
- Mini: whole file `87646188b32d47a5e4300ea8c3393d614d27b5ec1e4677519dea24899818dd06`
  to proposed `52a6f5b535585ee736dacb6585c03ee763a2305af80b368494576e7e2615405f`;
  unchanged nonselected-byte digest
  `2168fd6f064f351496257d1a16200497eed2681ed08a0d1be49dbeb4b9ebe852`.

Application is additionally held until a safe cross-host convergence decision
can preserve each file's unrelated edits; running both independent patches
would create competing Syncthing versions. It waits for Astra's reviewed release
acceptance and an exact convergence plan. It will not reset, reformat, or copy
either repository; touch PHP; deploy Tandemweb; or change
provider, roster, payment, enrollment, access, class, capacity, schedule, or
customer state.
