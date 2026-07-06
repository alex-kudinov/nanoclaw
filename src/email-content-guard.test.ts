import { describe, it, expect } from 'vitest';

import { checkContent } from './email-content-guard.js';

describe('checkContent', () => {
  it('passes a normal program reply with whitelisted links', () => {
    const r = checkContent(
      'Re: MCS Practicum',
      'The program is $2,997 — details at https://tandemcoach.co/mcs/mentor-coach-training/ ' +
        'and you can enroll at https://community.tandemcoaching.academy/invite. ' +
        'ICF rules: https://coachingfederation.org/mcs',
    );
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('blocks links to non-whitelisted domains', () => {
    const r = checkContent('Hi', 'see https://evil.example.net/page for more');
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toContain('evil.example.net');
  });

  it('blocks numeric discount offers', () => {
    expect(checkContent('', 'I can offer you 15% off today').ok).toBe(false);
    expect(checkContent('', 'discounted to $999 for you').ok).toBe(false);
    expect(checkContent('', 'we can waive the $175 fee').ok).toBe(false);
  });

  it('passes the correct "we do not offer discounts" reply', () => {
    const r = checkContent(
      '',
      'We do not offer discounts on our programs; module-by-module enrollment is the flexible option.',
    );
    expect(r.ok).toBe(true);
  });

  it('blocks unfilled placeholders', () => {
    expect(checkContent('', 'Hi [insert name], welcome!').ok).toBe(false);
    expect(checkContent('', 'Your start date is TBD right now').ok).toBe(false);
    expect(checkContent('', 'Dear {{first_name}}').ok).toBe(false);
  });

  it('reports multiple violations at once', () => {
    const r = checkContent(
      '',
      'Hi [name], get 20% off at https://sketchy.biz/deal',
    );
    expect(r.ok).toBe(false);
    expect(r.violations.length).toBeGreaterThanOrEqual(3);
  });
});
