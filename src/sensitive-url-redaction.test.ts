import { describe, expect, it } from 'vitest';

import { redactSensitiveUrlQueryParameters } from './sensitive-url-redaction.js';

describe('redactSensitiveUrlQueryParameters', () => {
  it('redacts passwordless-login and bearer query values without hiding context', () => {
    const source =
      'Login https://community.example/login?redirectTo=%2Fcourse&emailToken=secret-value\n' +
      'API https://example.test/path?access_token=abc123&view=summary\n' +
      'HTML https://example.test/path?view=summary&amp;auth_token=html-secret';

    const redacted = redactSensitiveUrlQueryParameters(source);

    expect(redacted).toContain('redirectTo=%2Fcourse');
    expect(redacted).toContain('emailToken=[REDACTED]');
    expect(redacted).toContain('access_token=[REDACTED]');
    expect(redacted).toContain('auth_token=[REDACTED]');
    expect(redacted).toContain('&view=summary');
    expect(redacted).not.toContain('secret-value');
    expect(redacted).not.toContain('abc123');
    expect(redacted).not.toContain('html-secret');
  });

  it('leaves ordinary URLs and prose unchanged', () => {
    const source =
      'See https://example.test/course?cohort=september&locale=en for details.';
    expect(redactSensitiveUrlQueryParameters(source)).toBe(source);
  });

  it('preserves sentence punctuation immediately after a redacted value', () => {
    expect(
      redactSensitiveUrlQueryParameters(
        'Open https://example.test/?token=secret. Then retry.',
      ),
    ).toBe('Open https://example.test/?token=[REDACTED]. Then retry.');
  });
});
