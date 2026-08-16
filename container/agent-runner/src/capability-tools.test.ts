import { describe, expect, it } from 'vitest';

import {
  buildAllowedTools,
  mcpToolIsAllowed,
  parseAllowedMcpTools,
} from './capability-tools.js';

describe('capability tool projection', () => {
  it('preserves the legacy wildcard when enforcement is off', () => {
    expect(buildAllowedTools()).toContain('mcp__nanoclaw__*');
  });

  it('projects only exact Claude and MCP tools when enforcement is on', () => {
    expect(
      buildAllowedTools({
        enforced: true,
        fingerprint: 'abc',
        claudeTools: ['Read'],
        mcpTools: ['gmail_read'],
      }),
    ).toEqual(['Read', 'mcp__nanoclaw__gmail_read']);
  });

  it('fails closed for malformed MCP allowlists', () => {
    const malformed = parseAllowedMcpTools('{');
    expect(malformed).toEqual(new Set());
    expect(mcpToolIsAllowed(malformed, 'send_message')).toBe(false);
  });

  it('treats an absent allowlist as compatibility mode', () => {
    expect(mcpToolIsAllowed(parseAllowedMcpTools(undefined), 'jobs')).toBe(
      true,
    );
  });
});
