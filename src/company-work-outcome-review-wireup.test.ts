import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const envExample = readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
);

describe('Company Work outcome-review daemon wiring', () => {
  it('is health-visible, reaction-bound, stoppable, and default-off', () => {
    expect(index).toContain('new CompanyWorkOutcomeReviewService(');
    expect(index).toContain(
      'companyWorkOutcomeReview: companyWorkOutcomeReview.getStatus()',
    );
    expect(index).toContain(
      'companyWorkOutcomeReview.handleReaction(ts, provenance)',
    );
    expect(index).toContain('companyWorkOutcomeReview.start()');
    expect(index).toContain('companyWorkOutcomeReview.stop()');
    expect(envExample).toContain('COMPANY_WORK_OUTCOME_REVIEW_ENABLED=0');
    expect(envExample).toContain('COMPANY_WORK_OUTCOME_REVIEW_OPERATOR_UIDS=');
  });
});
