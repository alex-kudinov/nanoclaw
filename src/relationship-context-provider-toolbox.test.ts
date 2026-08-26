import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const registry = JSON.parse(
  fs.readFileSync(path.join(root, '.toolbox/registry.json'), 'utf8'),
) as {
  include_shared: string[];
  categories: Record<
    string,
    { tools: Record<string, { script: string; args: unknown[] }> }
  >;
};
const wrapper = fs.readFileSync(
  path.join(root, '.toolbox/tools/encharge/bulk-get-people.sh'),
  'utf8',
);

describe('Relationship Context Encharge toolbox boundary', () => {
  it('exposes only the project read wrapper, not the shared mutation toolset', () => {
    expect(registry.include_shared).not.toContain('encharge');
    expect(Object.keys(registry.categories['encharge-read'].tools)).toEqual([
      'bulk-get-people',
    ]);
    expect(
      registry.categories['encharge-read'].tools['bulk-get-people'].script,
    ).toBe('tools/encharge/bulk-get-people.sh');
  });

  it('hard-codes the shared operation to bulk-get', () => {
    expect(wrapper).toContain('exec "$shared_tool" bulk-get "$@"');
    expect(wrapper).not.toMatch(/\b(upsert|archive|unsubscribe|event|send)\b/);
  });
});
