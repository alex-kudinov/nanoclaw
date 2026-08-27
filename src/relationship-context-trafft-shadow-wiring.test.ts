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

  it('runs source enrichment without blocking, overlapping, or retaining the event loop', () => {
    expect(indexSource).toContain(
      'void runRelationshipContextSourceEnrichmentTick();',
    );
    expect(indexSource).toContain(
      'relationshipContextSourceEnrichmentTimer.unref();',
    );
    expect(indexSource).toContain(
      'if (relationshipContextSourceEnrichmentInFlight)',
    );
    expect(indexSource).toContain(
      'relationshipContextSourceEnrichmentInFlight = false;',
    );
    expect(indexSource).not.toContain(
      'await runRelationshipContextSourceEnrichmentTick();',
    );
  });
});
