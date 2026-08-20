// Extract and sanitize Tandem contact-form submissions.
// Supports both the legacy Gravity Forms field IDs and the current
// WordPress contact endpoint payload.

const wrapped = $input.first().json;
const entry = (wrapped && wrapped.original) || wrapped;

function getField(obj, ...keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return String(obj[key]);
    }
  }
  return '';
}

const data = entry.body || entry;

const firstName = getField(
  data,
  '1.3',
  'first_name',
  'Name (First Name)',
  'name_first',
  'first',
);
const lastName = getField(
  data,
  '1.6',
  'last_name',
  'Name (Last Name)',
  'name_last',
  'last',
);
const email = getField(data, '2', 'email', 'Email');
const message = getField(
  data,
  '3',
  '10',
  'message',
  'What Would You Like Help With?',
  'textarea',
);
const entryDate = getField(
  data,
  'date_created',
  'Entry Date',
  'entry_date',
  'created_at',
  'received_at',
);
const company = getField(data, 'company', 'organization', 'Company');
const entryPage = getField(data, 'entry_page');

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').trim();
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max)}...` : str;
}

function validateEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str) ? str : '';
}

function normalizeEntryPage(str) {
  if (/[<>]/.test(str)) {
    return '';
  }
  const clean = stripHtml(str).slice(0, 200);
  if (clean.startsWith('/') && !/[?#\s\x00-\x1F\x7F]/.test(clean)) {
    return clean;
  }
  if (/^external:[a-z0-9.-]+$/i.test(clean)) {
    return clean.toLowerCase();
  }
  return '';
}

const name = stripHtml(`${firstName} ${lastName}`.trim());
const cleanEmail = validateEmail(stripHtml(email).toLowerCase());
const cleanMessage = truncate(stripHtml(message), 2000);
const cleanCompany = stripHtml(company);
const cleanEntryPage = normalizeEntryPage(entryPage);

// Drop invalid submissions - returning [] stops the workflow.
if (!cleanEmail || !cleanMessage) {
  console.log(`Dropped: email=${!!cleanEmail} message=${!!cleanMessage}`);
  return [];
}

return [
  {
    json: {
      name: truncate(name, 200),
      email: cleanEmail,
      company: truncate(cleanCompany, 200),
      message: cleanMessage,
      entry_page: cleanEntryPage,
      submitted_at: entryDate || new Date().toISOString(),
    },
  },
];
