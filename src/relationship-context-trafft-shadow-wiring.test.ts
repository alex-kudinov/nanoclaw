import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexSource = fs.readFileSync(
  new URL('./index.ts', import.meta.url),
  'utf8',
);

describe('relationship context Trafft shadow host wiring', () => {
  it('does not block startup, overlap ticks, or retain the event loop', () => {
    expect(indexSource).toContain(
      'void runRelationshipContextTrafftShadowTick();',
    );
    expect(indexSource).toContain(
      'relationshipContextTrafftShadowTimer.unref();',
    );
    expect(indexSource).toContain(
      'if (relationshipContextTrafftShadowInFlight)',
    );
    expect(indexSource).toContain(
      'relationshipContextTrafftShadowInFlight = false;',
    );
    expect(indexSource).not.toContain(
      'await runRelationshipContextTrafftShadowTick();',
    );
  });
});
