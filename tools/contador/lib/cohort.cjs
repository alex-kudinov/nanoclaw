/**
 * Derive the MCS practicum cohort from Stripe-owned payment evidence.
 *
 * Historical checkouts named the cohort in metadata.product or the product/
 * charge description. Current checkout metadata separates it across
 * cohort_start/cohort_range and cohort_label. A label is emitted only when
 * both the month/year and weekday are present; partial evidence stays blank.
 */

const MONTHS = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sept', 'sep'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = [
  ['monday', 'mondays', 'mon'],
  ['tuesday', 'tuesdays', 'tues', 'tue'],
  ['wednesday', 'wednesdays', 'weds', 'wed'],
  ['thursday', 'thursdays', 'thurs', 'thur', 'thu'],
  ['friday', 'fridays', 'fri'],
  ['saturday', 'saturdays', 'sat'],
  ['sunday', 'sundays', 'sun'],
];

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const COHORT_COLUMN = 'Cohort';

function matchToken(text, groups) {
  for (let i = 0; i < groups.length; i += 1) {
    for (const token of groups[i]) {
      if (new RegExp(`\\b${token}\\b`, 'i').test(text)) return i;
    }
  }
  return -1;
}

function cohortYear(monthIndex, purchasedAt) {
  const year = purchasedAt.getFullYear();
  return monthIndex >= purchasedAt.getMonth() ? year : year + 1;
}

function labelFromText(text, purchasedAt) {
  if (!text) return '';
  const monthIndex = matchToken(text, MONTHS);
  const weekdayIndex = matchToken(text, WEEKDAYS);
  if (monthIndex < 0 || weekdayIndex < 0) return '';
  const explicitYear = String(text).match(/\b(20\d{2})\b/)?.[1];
  const year = explicitYear
    ? Number(explicitYear)
    : cohortYear(monthIndex, purchasedAt);
  return `${MONTH_NAMES[monthIndex]} ${year} – ${WEEKDAY_NAMES[weekdayIndex]}`;
}

function labelFromStructuredMetadata(metadata, purchasedAt) {
  const program = String(metadata?.cohort_program || '')
    .trim()
    .toLowerCase();
  if (program !== 'mcs-practicum') return '';

  const weekdayIndex = matchToken(
    String(metadata?.cohort_label || ''),
    WEEKDAYS,
  );
  if (weekdayIndex < 0) return '';

  const start = String(metadata?.cohort_start || '');
  const startMatch = start.match(/^(20\d{2})-(0[1-9]|1[0-2])(?:-|T)/);
  if (startMatch) {
    const year = Number(startMatch[1]);
    const monthIndex = Number(startMatch[2]) - 1;
    return `${MONTH_NAMES[monthIndex]} ${year} – ${WEEKDAY_NAMES[weekdayIndex]}`;
  }

  return labelFromText(
    `${metadata?.cohort_range || ''} ${metadata?.cohort_label || ''}`,
    purchasedAt,
  );
}

function hasMcsPracticumEvidence(metadata, chargeDescription, productName) {
  const program = String(metadata?.cohort_program || '')
    .trim()
    .toLowerCase();
  if (program) return program === 'mcs-practicum';

  const productSlug = String(metadata?.product || '')
    .trim()
    .toLowerCase();
  if (
    /^mcs-cohort-(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)-/.test(
      productSlug,
    )
  )
    return true;

  return [chargeDescription, productName].some((value) => {
    const text = String(value || '');
    return (
      /\bmentor coach training\b/i.test(text) ||
      /\bMCS advanced accreditation mentor coaching\b/i.test(text)
    );
  });
}

function resolveCohortLabel({
  chargeMetadata = {},
  chargeDescription = '',
  productName = '',
  purchasedAt,
} = {}) {
  const when =
    purchasedAt instanceof Date && !Number.isNaN(purchasedAt.getTime())
      ? purchasedAt
      : new Date();

  const structured = labelFromStructuredMetadata(chargeMetadata, when);
  if (structured) return structured;

  if (!hasMcsPracticumEvidence(chargeMetadata, chargeDescription, productName))
    return '';

  const sources = [
    chargeMetadata?.cohort || '',
    chargeMetadata?.product || '',
    chargeDescription,
    productName,
  ];
  for (const source of sources) {
    const label = labelFromText(String(source || ''), when);
    if (label) return label;
  }
  return '';
}

module.exports = {
  resolveCohortLabel,
  COHORT_COLUMN,
  MONTH_NAMES,
  WEEKDAY_NAMES,
};
