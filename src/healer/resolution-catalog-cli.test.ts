import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseHealerResolutionCatalogArgs } from './resolution-catalog-cli.js';

describe('healer resolution catalog CLI', () => {
  it('defaults to a human-readable bounded read', () => {
    expect(parseHealerResolutionCatalogArgs([])).toEqual({ json: false });
  });

  it('accepts explicit JSON and limit options', () => {
    expect(
      parseHealerResolutionCatalogArgs(['--json', '--limit', '100']),
    ).toEqual({ json: true, limit: 100 });
  });

  it('refuses unknown or malformed arguments', () => {
    expect(() => parseHealerResolutionCatalogArgs(['--write'])).toThrow(
      'unknown argument',
    );
    expect(() => parseHealerResolutionCatalogArgs(['--limit', '0'])).toThrow(
      'positive integer',
    );
  });

  it('remains a standalone read with no daemon, scheduler, or action wiring', () => {
    for (const file of [
      'src/index.ts',
      'src/task-scheduler.ts',
      'src/healer/collector.ts',
      'src/healer/remediate.ts',
      'src/healer/approval.ts',
      'src/healer/implement.ts',
    ]) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toContain(
        'resolution-catalog',
      );
    }
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['healer:resolution-catalog']).toBe(
      './scripts/with-pinned-node.sh node dist/healer/resolution-catalog-cli.js',
    );
  });
});
