/**
 * Host-owned correlation between one scheduled Procurement scan and the
 * CaleProcure source run it creates through IPC.
 *
 * The model may propose a run key, but it cannot attest which scheduled task
 * caused the write. While a receipted task container is active, the host
 * overrides that key with this deterministic token.
 */

const activeTokens = new Map<string, string>();
const RUN_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function procurementRunToken(
  taskId: string,
  startedAtMs: number,
): string {
  if (!Number.isSafeInteger(startedAtMs) || startedAtMs < 0) {
    throw new Error('Procurement task start time is invalid');
  }
  const token = `t.${taskId}.${startedAtMs}`;
  if (!RUN_TOKEN_RE.test(token)) {
    throw new Error(
      'Procurement task identity cannot form a bounded run token',
    );
  }
  return token;
}

export function beginProcurementTaskRun(
  groupFolder: string,
  taskId: string,
  startedAtMs: number,
): string {
  if (activeTokens.has(groupFolder)) {
    throw new Error(
      `Procurement task run is already active for ${groupFolder}`,
    );
  }
  const token = procurementRunToken(taskId, startedAtMs);
  activeTokens.set(groupFolder, token);
  return token;
}

export function activeProcurementTaskRun(
  groupFolder: string,
): string | undefined {
  return activeTokens.get(groupFolder);
}

export function endProcurementTaskRun(
  groupFolder: string,
  expectedToken: string,
): void {
  if (activeTokens.get(groupFolder) === expectedToken) {
    activeTokens.delete(groupFolder);
  }
}

/** @internal - test isolation only. */
export function _resetProcurementTaskRunsForTests(): void {
  activeTokens.clear();
}
