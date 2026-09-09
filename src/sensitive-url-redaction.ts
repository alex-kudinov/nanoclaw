const SENSITIVE_QUERY_PARAMETER =
  /((?:[?&]|&amp;)(?:emailtoken|access_token|auth_token|magic_token|token|signature|sig)=)[^&#\s<>"'),.\]]+/gi;

/**
 * Remove bearer-like values from URLs before email text enters agent, Slack,
 * transcript, or container-log surfaces. The parameter name and surrounding
 * URL remain visible so the agent can understand that a login/action link was
 * present without receiving a usable credential.
 */
export function redactSensitiveUrlQueryParameters(text: string): string {
  return text.replace(SENSITIVE_QUERY_PARAMETER, '$1[REDACTED]');
}
