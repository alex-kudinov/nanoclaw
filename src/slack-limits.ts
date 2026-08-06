/** Slack chat.postMessage's practical per-message text limit. */
export const SLACK_MESSAGE_MAX_LENGTH = 4000;

/** Prefix added by the Slack transport to model-authored group messages. */
export function slackMessagePrefix(text: string, fromGroup?: string): string {
  return fromGroup && !text.startsWith('[') ? `[${fromGroup}]\n` : '';
}

/** Keep every preflight identical to the bytes the Slack transport measures. */
export function isSlackMessageOverLimit(
  text: string,
  fromGroup?: string,
): boolean {
  return (
    slackMessagePrefix(text, fromGroup).length + text.length >
    SLACK_MESSAGE_MAX_LENGTH
  );
}
