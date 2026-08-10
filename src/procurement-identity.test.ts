import { describe, expect, it } from 'vitest';

import {
  assertCaleProcureDetailIdentity,
  normalizeCaleProcureIdentity,
  resolveCaleProcureBusinessUnit,
} from './procurement-identity.js';

describe('CaleProcure identity', () => {
  it('normalizes only case and whitespace', () => {
    expect(
      normalizeCaleProcureIdentity('  SF Bay   Conservation Commission  '),
    ).toBe('sf bay conservation commission');
  });

  it('requires exactly one normalized department-name match', () => {
    expect(
      resolveCaleProcureBusinessUnit(
        [{ businessUnit: '3820', name: 'SF Bay Conservation Commission' }],
        ' sf bay  conservation commission ',
      ),
    ).toEqual({
      businessUnit: '3820',
      name: 'SF Bay Conservation Commission',
    });

    expect(() =>
      resolveCaleProcureBusinessUnit(
        [{ businessUnit: '3820', name: 'SF Bay Conservation Commission' }],
        'Bay Conservation',
      ),
    ).toThrow('0 exact matches');

    expect(() =>
      resolveCaleProcureBusinessUnit(
        [
          { businessUnit: '3820', name: 'SF Bay Conservation Commission' },
          { businessUnit: '9999', name: 'sf bay conservation commission' },
        ],
        'SF Bay Conservation Commission',
      ),
    ).toThrow('2 exact matches');
  });

  it('requires exact event, department, and title on the detail page', () => {
    const expected = {
      eventId: '0000039985',
      title: 'NOTICE OF INTENT TO AWARD',
      agency: 'SF Bay Conservation Commission',
    };
    expect(() =>
      assertCaleProcureDetailIdentity(expected, {
        eventId: '0000039985',
        title: ' notice of intent   to award ',
        agency: 'sf bay conservation commission',
      }),
    ).not.toThrow();
    expect(() =>
      assertCaleProcureDetailIdentity(expected, {
        ...expected,
        eventId: '0000039986',
      }),
    ).toThrow('event ID mismatch');
    expect(() =>
      assertCaleProcureDetailIdentity(expected, {
        ...expected,
        agency: 'SF Bay',
      }),
    ).toThrow('department mismatch');
    expect(() =>
      assertCaleProcureDetailIdentity(expected, {
        ...expected,
        title: 'NOTICE OF AWARD',
      }),
    ).toThrow('title mismatch');
  });
});
