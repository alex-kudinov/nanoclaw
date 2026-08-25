import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('./ipc-mcp-stdio.ts', import.meta.url),
  'utf8',
);

describe('party_context_get MCP contract', () => {
  it('stamps host context outside the model schema and exposes no work id', () => {
    const block = source.slice(
      source.indexOf("'party_context_get'"),
      source.indexOf("'procurement_queue'"),
    );
    expect(block).toContain('source_container: containerName || undefined');
    expect(block).toContain('run_id: runId');
    expect(block).toContain('groupFolder');
    expect(block).not.toContain('work_item_id');
    expect(block).not.toContain('workItemId');
  });

  it('requires exactly one bounded subject form and returns only a queued acknowledgement', () => {
    const block = source.slice(
      source.indexOf("'party_context_get'"),
      source.indexOf("'procurement_queue'"),
    );
    expect(block).toContain(
      'args.party_id === undefined && externalCount !== 4',
    );
    expect(block).toContain(
      'args.party_id !== undefined && externalCount !== 0',
    );
    expect(block).toContain('Relationship Context request queued');
    expect(block).not.toContain('[RELATIONSHIP CONTEXT]');
  });
});
