# NC-20260906-001 Codex disposition of Claude R1

Claude Sonnet/high found one material test-coverage gap: the validator already
rejected arithmetic drift and missing provider readback, but the new resolution
test block did not exercise those two branches.

The finding is fixed with two dedicated regressions:

- corrupting resolved occupancy/overage now proves both capacity arithmetic and
  assignment-route balance fail;
- clearing the verified Heartbeat September-membership removal now proves the
  settled-deferral readback gate fails.

Post-fix verification passes: aggregate/hash-only evidence validator, 21/21
focused tests, pinned typecheck, documentation continuity/capability, formatting,
privacy checks, and diff checks. No second Claude round is needed because the
load-bearing correction is mechanically verified and does not change the
accepted source facts or mutation boundary.
