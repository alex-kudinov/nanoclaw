export interface IpcTurnCandidate {
  text: string;
  runId?: string;
  /** True when the payload carried run_id, even if its value was malformed. */
  isolated: boolean;
}

/**
 * Select at most one logical Claude turn from ordered IPC payloads.
 *
 * Legacy payloads retain their historical merge behaviour. A payload carrying
 * run_id is a grader proof boundary and therefore stands alone; later files are
 * left unread and unacked until the next turn.
 */
export function selectNextIpcTurn<T extends IpcTurnCandidate>(
  candidates: T[],
  mergeIntoExisting: boolean,
): T[] {
  if (candidates.length === 0) return [];
  if (mergeIntoExisting && candidates[0].isolated) return [];
  if (candidates[0].isolated) return [candidates[0]];

  const selected: T[] = [];
  for (const candidate of candidates) {
    if (candidate.isolated) break;
    selected.push(candidate);
  }
  return selected;
}
