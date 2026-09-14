# Tandem Identity D3: Heartbeat aggregate reconciliation

D3 records what the current Heartbeat API can prove without pretending it can
identify or repair an individual student. It is a one-shot, host-only import
into the admin-only migration-167 reconciliation tables.

## Data path

1. The established toolbox reads the Heartbeat `main` workspace twice and
   inventories webhook registrations. No new provider client is introduced.
2. `prepare-tandem-identity-d3-heartbeat-snapshot.mjs` requires two stable,
   complete censuses no more than 15 minutes apart and a contemporaneous
   webhook inventory.
3. The prepared artifact retains only provider UUIDs, counts, timestamps and
   SHA-256 fingerprints. It contains no person or group names, email values,
   webhook filters, destinations, URLs, raw payloads or credentials.
4. The artifact is transferred privately to `mini-claw.local` and imported
   once through the compiled host-pinned CLI. No Heartbeat credential is
   installed on that host.
5. The transaction writes one aggregate full reconciliation run, aggregate
   snapshot items, one control projection, one blocked command and one
   unavailable readback. Exact artifact replay returns `duplicate` and writes
   nothing.

## Truth boundary

The current census proves the complete user set and every group's aggregate
membership fingerprint, but does not expose which user belongs to which group
in the minimized artifact. Therefore D3 explicitly records
`INDIVIDUAL_IDENTITY_GRAPH_UNAVAILABLE` and keeps all person resolution,
absence decisions and access repair blocked.

D3 cannot create or merge a Party, bind an external reference or auth subject,
resolve an identity, mutate enrollment/entitlement/access/customer state,
attempt a provider command, or call Heartbeat. Migration 167 also enforces
zero-write commands and unconditionally rejects provider-attempt inserts.

## Operator commands

Build before preparation so the script cannot use stale compiled logic:

```sh
npm run build
npm run tandem-identity-d3:prepare -- \
  --census-first <first.json> --census-second <second.json> \
  --webhooks <webhooks.json> --webhook-observed-at <timestamp> \
  --output <private-mode-0600-artifact.json>
```

On the exact reviewed release on `mini-claw.local`:

```sh
npm run tandem-identity-d3:validate -- --stage pre-import --database nanoclaw_business
npm run tandem-identity-d3:import -- --snapshot <private-artifact.json>
npm run tandem-identity-d3:import -- --snapshot <same-private-artifact.json>
npm run tandem-identity-d3:validate -- --stage post-import --database nanoclaw_business
```

The first import must report `imported`, the second `duplicate`, and both must
report `providerAttempts: 0`, `status: blocked` and
`individualIdentityGraphAvailable: false`. Compare the validator's protected
baseline before and after. Any drift stops admission.
