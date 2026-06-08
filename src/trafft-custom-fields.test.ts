import { describe, it, expect } from 'vitest';
import {
  extractTrafftCustomFields,
  classifyCustomFields,
} from './trafft-custom-fields.js';
import canceledFixture from './fixtures/canceled-webhook.json' with { type: 'json' };

// Mirrors a real Trafft Consultation Call `booked` payload (appt 56).
const realBooked = {
  serviceName: 'Consultation Call',
  appointmentId: '56',
  'customFields[0][label]': 'What would you like to discuss?',
  'customFields[0][value]': 'Scheduling a Session - PCC Exam Review',
  'customFields[1][label]': 'How did you learn about Tandem?',
  'customFields[1][value]': 'Through Cherie from the Agile Community',
  'customFieldItems[How did you learn about Tandem?]':
    'Through Cherie from the Agile Community',
  'customFieldItems[What would you like to discuss?]':
    'Scheduling a Session - PCC Exam Review',
};

describe('extractTrafftCustomFields', () => {
  it('parses indexed customFields[N][label]/[value] in order', () => {
    const fields = extractTrafftCustomFields(realBooked);
    expect(fields).toEqual([
      {
        label: 'What would you like to discuss?',
        value: 'Scheduling a Session - PCC Exam Review',
      },
      {
        label: 'How did you learn about Tandem?',
        value: 'Through Cherie from the Agile Community',
      },
    ]);
  });

  it('dedupes the redundant customFieldItems[label] form', () => {
    // realBooked carries both representations; result must not double up.
    expect(extractTrafftCustomFields(realBooked)).toHaveLength(2);
  });

  it('falls back to customFieldItems[label] when no indexed form', () => {
    const fields = extractTrafftCustomFields({
      'customFieldItems[How did you learn about Tandem?]': 'Web search',
    });
    expect(fields).toEqual([
      { label: 'How did you learn about Tandem?', value: 'Web search' },
    ]);
  });

  it('ignores customer-PROFILE fields (customerCustomFields/Items)', () => {
    const fields = extractTrafftCustomFields({
      'customerCustomFields[Customer Custom Field 1]': 'junk',
      'customerCustomFieldItems[0][label]': 'Customer Custom Field 1',
      'customerCustomFieldItems[0][value]': 'junk',
    });
    expect(fields).toEqual([]);
  });

  it('parses the canceled fixture', () => {
    const fields = extractTrafftCustomFields(canceledFixture);
    expect(fields.map((f) => f.label)).toContain(
      'What would you like to discuss?',
    );
    expect(fields.map((f) => f.label)).toContain(
      'How did you learn about Tandem?',
    );
  });

  it('returns [] for a payload with no custom fields', () => {
    expect(extractTrafftCustomFields({ serviceName: 'X' })).toEqual([]);
    expect(extractTrafftCustomFields(null)).toEqual([]);
  });
});

describe('classifyCustomFields', () => {
  it('maps discuss → reason and how-did-you-learn → source', () => {
    const c = classifyCustomFields(extractTrafftCustomFields(realBooked));
    expect(c.reason?.value).toBe('Scheduling a Session - PCC Exam Review');
    expect(c.source?.value).toBe('Through Cherie from the Agile Community');
    expect(c.other).toEqual([]);
  });

  it('routes unmatched labels to other', () => {
    const c = classifyCustomFields([{ label: 'Company size', value: '50' }]);
    expect(c.reason).toBeUndefined();
    expect(c.source).toBeUndefined();
    expect(c.other).toEqual([{ label: 'Company size', value: '50' }]);
  });
});
