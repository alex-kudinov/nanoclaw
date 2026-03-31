#!/usr/bin/env node
/**
 * PreToolUse hook: strips auth secrets from Bash command environments.
 * Reads hook input from stdin, outputs updatedInput JSON to stdout.
 */
const SECRET_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const command = input.tool_input?.command;
    if (!command) {
      console.log(JSON.stringify({}));
      return;
    }
    const unsetPrefix = `unset ${SECRET_VARS.join(' ')} 2>/dev/null; `;
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { ...input.tool_input, command: unsetPrefix + command },
      },
    }));
  } catch {
    console.log(JSON.stringify({}));
  }
});
