import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const index = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('Company Work exception dispatch daemon wiring', () => {
  it('keeps the summary operator-only and the exact packets actionable', () => {
    expect(index).toContain(
      "return slack.postTracked(jid, text, undefined, 'chief');",
    );
    expect(index).toContain(
      "return slack.postTracked(jid, text, threadTs, 'company-os');",
    );
  });

  it('records pickup before Chief dispatch and finishes the attempt from the turn result', () => {
    expect(index).toContain(
      'await companyWorkExceptionLoopForMessages.beginPacketAttempt(',
    );
    expect(index).toContain(
      'await companyWorkExceptionLoopForMessages?.finishPacketAttempt(',
    );
    expect(index).toContain(
      "'Company Work packet pickup failed closed before agent dispatch'",
    );
    expect(index).toContain(
      "'Company Work packet attempt could not be durably finished'",
    );
    expect(index).toContain(
      "'Company Work packet replay skipped after durable completed attempt'",
    );
    expect(index).toContain('[HOST COMPANY WORK ATTEMPT SCOPE]');
    expect(index).toContain(
      'Other packets visible in the thread are context only and must not be re-attempted.',
    );
  });
});
