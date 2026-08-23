import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseHealerCompanyWorkPlanArgs } from './company-work-projection-cli.js';

describe('healer Company Work plan CLI', () => {
  it('accepts only read-only output controls', () => {
    expect(parseHealerCompanyWorkPlanArgs([])).toEqual({ json: false });
    expect(parseHealerCompanyWorkPlanArgs(['--json', '--limit', '20'])).toEqual(
      { json: true, limit: 20 },
    );
    expect(() => parseHealerCompanyWorkPlanArgs(['--apply'])).toThrow(
      'unknown argument',
    );
  });

  it('has no daemon, scheduler, ledger-writer, or action wiring', () => {
    for (const file of [
      'src/index.ts',
      'src/task-scheduler.ts',
      'src/healer/collector.ts',
      'src/healer/remediate.ts',
      'src/healer/approval.ts',
      'src/healer/implement.ts',
      'src/company-work-ledger.ts',
    ]) {
      expect(fs.readFileSync(file, 'utf8'), file).not.toContain(
        'company-work-projection',
      );
    }
    const source = fs.readFileSync(
      'src/healer/company-work-projection-cli.ts',
      'utf8',
    );
    expect(source).not.toMatch(/--apply|transitionCompany|ensureCompany/);
  });
});
