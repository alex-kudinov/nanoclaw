export interface IpcLoopDecision<T> {
  turn?: T;
  close: boolean;
}

export const SCHEDULED_TASK_PREFIX =
  '[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]';

/** Scheduled jobs and webhooks are one-shot tasks, not warm conversations. */
export function prepareScheduledTaskPrompt(
  prompt: string,
  isScheduledTask: boolean | undefined,
): string {
  if (!isScheduledTask || prompt.startsWith(SCHEDULED_TASK_PREFIX)) {
    return prompt;
  }
  return `${SCHEDULED_TASK_PREFIX}\n\n${prompt}`;
}

/** Exit immediately after emitting the one result for a scheduled task. */
export function shouldExitAfterTurn(
  isScheduledTask: boolean | undefined,
): boolean {
  return isScheduledTask === true;
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
