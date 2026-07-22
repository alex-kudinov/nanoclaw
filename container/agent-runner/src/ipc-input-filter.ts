/**
 * Ownership filter for piped IPC input payloads.
 *
 * The host writes follow-up messages into a per-groupFolder input dir
 * (`/workspace/ipc/input`) that is SHARED by every container of that group. With
 * concurrent same-group containers (thread-per-message + a raised
 * MAX_CONCURRENT_CONTAINERS) a bare payload is drained by whichever container
 * polls first — which may hold a different session's context. On 2026-07-21 a
 * thread-scoped approval was consumed by the root container and sent a stale
 * (pre-correction) draft to a customer.
 *
 * The host now stamps each payload with `target_container`. A container drains
 * only payloads addressed to it (or untargeted ones); it leaves siblings' work
 * in place. Kept in its own module so it is unit-testable — the entry point
 * (index.ts) runs `main()` on import and cannot be pulled into a test.
 */
export function payloadIsForThisContainer(
  targetContainer: string | undefined,
  containerName: string,
): boolean {
  // Untargeted payload (legacy / mid-rolling-deploy): consume as before.
  if (!targetContainer) return true;
  // No identity of our own → cannot prove ownership; consume (single-runner
  // fallback, matching the pre-targeting `_close` behaviour).
  if (!containerName) return true;
  // Targeted: only the addressed container drains it.
  return targetContainer === containerName;
}
