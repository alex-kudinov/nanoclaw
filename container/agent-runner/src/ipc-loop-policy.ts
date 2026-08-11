export interface IpcLoopDecision<T> {
  turn?: T;
  close: boolean;
}

/**
 * Exact pending input wins over a close request. The host may have scheduled
 * close while Claude was still in a long turn; an asynchronous rejection or
 * Gmail result that arrived during that turn must be consumed first.
 */
export function drainBeforeClose<T>(
  drain: () => T | undefined,
  shouldClose: () => boolean,
): IpcLoopDecision<T> {
  const turn = drain();
  if (turn !== undefined) return { turn, close: false };
  return { close: shouldClose() };
}
