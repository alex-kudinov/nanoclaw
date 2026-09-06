import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const prompt = fs.readFileSync('groups/capacity/CLAUDE.md', 'utf8');
const capability = JSON.parse(
  fs.readFileSync('capabilities/capacity.json', 'utf8'),
);

describe('Academy Capacity minion prompt contract', () => {
  it('reports exact inventory without offering identity disclosure or mutations', () => {
    expect(prompt).toContain('Answer the request and stop.');
    expect(prompt).toContain('Never enumerate, identify, or offer to identify');
    expect(prompt).toContain(
      'do not speculate that they are merely likely data errors',
    );
    expect(prompt).toContain(
      "Rita's September-Friday-to-January-Thursday transfer is settled",
    );
  });

  it('has no identity, provider, message, shell, credential, or network escape', () => {
    expect(capability.credentials.families).toEqual([]);
    expect(capability.network).toEqual({ mode: 'none', services: [] });
    expect(capability.tools.claude).not.toContain('Bash');
    expect(capability.tools.mcp).not.toContain('send_message');
    expect(capability.tools.mcp).not.toContain('gmail_read');
    expect(capability.tools.mcp).not.toContain('capacity_participants');
  });
});
