#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let template = path.resolve(
  'setup/n8n/student-lifecycle-community-shadow-workflow.json',
);
let output = '';
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--template') template = path.resolve(args[++index] ?? '');
  else if (args[index] === '--output') output = path.resolve(args[++index] ?? '');
  else throw new Error(`unknown argument: ${args[index]}`);
}
if (!output) throw new Error('--output is required');
if (fs.existsSync(output)) throw new Error('output already exists');
const webhookPath = process.env.STUDENT_LIFECYCLE_N8N_WEBHOOK_PATH ?? '';
if (!/^[A-Za-z0-9_-]{32,160}$/.test(webhookPath)) {
  throw new Error('STUDENT_LIFECYCLE_N8N_WEBHOOK_PATH is missing or invalid');
}
const source = fs.readFileSync(template, 'utf8');
const placeholder = '__STUDENT_LIFECYCLE_N8N_WEBHOOK_PATH__';
if (source.split(placeholder).length - 1 !== 2) {
  throw new Error('workflow placeholder count is not exactly two');
}
const rendered = source.replaceAll(placeholder, webhookPath);
const parsed = JSON.parse(rendered);
if (parsed.active !== false) throw new Error('rendered workflow must be inactive');
fs.writeFileSync(output, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(
  `${JSON.stringify({ ok: true, id: parsed.id, active: parsed.active, output })}\n`,
);
