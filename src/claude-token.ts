/**
 * Shared access to the rotated Claude OAuth subscription token — the one the
 * Print Bridge rotates across the alex/info/cnpc accounts
 * (toolbox/shared/claude/bridge/server.js). Both the healer's agentic runs AND
 * host job-runner child processes that shell `claude -p` (e.g. tandemweb's
 * seo-rescue) need it: bare `claude -p` 401s on the stale
 * ~/.claude/.credentials.json, and launchd injects no Claude creds. This is the
 * sanctioned exception to the bridge-not-CLI rule for token-only injection —
 * those runs need real tools, which the bridge can't provide.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The active rotated Claude OAuth token: ~/.shared/.claude-active-token names the
 * account, ~/.shared/.claude-tokens.json holds its sk-ant-oat token. Null if the
 * rotation files are absent (caller must skip rather than spawn a 401 run).
 */
export function activeOAuthToken(): string | null {
  const dir =
    process.env.CLAUDE_ROTATION_DIR || path.join(os.homedir(), '.shared');
  try {
    const active = fs
      .readFileSync(path.join(dir, '.claude-active-token'), 'utf-8')
      .trim();
    const tokens = JSON.parse(
      fs.readFileSync(path.join(dir, '.claude-tokens.json'), 'utf-8'),
    );
    return tokens[active] || null;
  } catch {
    return null;
  }
}

/**
 * Inject the rotated OAuth token into an env for a headless `claude` child.
 * No-op when no token is available — never makes a run worse than the prior
 * (tokenless) behavior. Drops ANTHROPIC_API_KEY: an OAuth token + API key
 * together confuse the CLI's auth selection.
 */
export function injectClaudeToken(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const token = activeOAuthToken();
  if (token) {
    env.CLAUDE_CODE_OAUTH_TOKEN = token;
    delete env.ANTHROPIC_API_KEY;
  }
  return env;
}
