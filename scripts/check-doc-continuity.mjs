#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const requiredFiles = [
  'CLAUDE.md',
  'AGENTS.md',
  'docs/PROJECT-MAP.md',
  'docs/CHANGE-PROTOCOL.md',
  'docs/ACTIVE-WORK.md',
  'docs/ENGINEERING-CHANGELOG.md',
];
const continuityFiles = [
  'docs/CHANGE-PROTOCOL.md',
  'docs/ACTIVE-WORK.md',
  'docs/ENGINEERING-CHANGELOG.md',
];
const trackedAuthorityFiles = [
  ...requiredFiles,
  'data/business/CLAUDE.md',
  'data/business/migrations/nanoclaw-v2/README.md',
  'data/business/migrations/nanoclaw-v2/113_followup_suppression.sql',
  'groups/sales/CLAUDE-MAIN.md',
  'groups/sales/EMAIL-RESPONSE-GUIDELINES.md',
  'groups/sales/SCHEMA.md',
  'groups/sales/VOICE-AND-TONE.md',
  'groups/sales/WORKFLOWS.md',
  'scripts/check-doc-continuity.mjs',
  'scripts/sanitize-schema-doc.mjs',
  'tools/refresh-schemas.sh',
];
const allowedStatuses = new Set([
  'planned',
  'in_progress',
  'blocked',
  'validating',
  'ready_for_review',
  'ready_for_deploy',
  'deployed_unverified',
  'complete',
  'cancelled',
]);
const taskIdPattern = 'NC-\\d{8}-\\d{3}';

const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`missing required file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

for (const file of requiredFiles) read(file);

function isTracked(relativePath) {
  try {
    execFileSync(
      'git',
      ['ls-files', '--error-unmatch', '--', relativePath],
      { cwd: root, stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
}

for (const file of trackedAuthorityFiles) {
  if (fs.existsSync(path.join(root, file)) && !isTracked(file)) {
    failures.push(`required authority is not Git-tracked: ${file}`);
  }
}

const migrationDir = path.join(
  root,
  'data/business/migrations/nanoclaw-v2',
);
if (fs.existsSync(migrationDir)) {
  for (const name of fs.readdirSync(migrationDir)) {
    if (
      (name.endsWith('.sql') ||
        name.endsWith('.sh') ||
        name === 'README.md') &&
      !isTracked(`data/business/migrations/nanoclaw-v2/${name}`)
    ) {
      failures.push(`business migration source is not Git-tracked: ${name}`);
    }
  }
}

const groupsDir = path.join(root, 'groups');
const trackedGroupSupportNames = new Set([
  'CLAUDE.md',
  'CLAUDE-MAIN.md',
  'EMAIL-RESPONSE-GUIDELINES.md',
  'SCHEMA.md',
  'VOICE-AND-TONE.md',
  'WORKFLOWS.md',
]);
if (fs.existsSync(groupsDir)) {
  for (const group of fs.readdirSync(groupsDir)) {
    const groupDir = path.join(groupsDir, group);
    if (!fs.statSync(groupDir).isDirectory()) continue;
    for (const name of fs.readdirSync(groupDir)) {
      const relativePath = `groups/${group}/${name}`;
      if (
        trackedGroupSupportNames.has(name) &&
        fs.statSync(path.join(root, relativePath)).isFile() &&
        !isTracked(relativePath)
      ) {
        failures.push(`group operating support is not Git-tracked: ${relativePath}`);
      }
    }
  }
}

const claude = read('CLAUDE.md');
const agents = read('AGENTS.md');
const projectMap = read('docs/PROJECT-MAP.md');
const protocol = read('docs/CHANGE-PROTOCOL.md');
const activeWork = read('docs/ACTIVE-WORK.md');
const changelog = read('docs/ENGINEERING-CHANGELOG.md');

for (const file of continuityFiles) {
  if (!claude.includes(file)) {
    failures.push(`CLAUDE.md does not point to ${file}`);
  }
  if (!agents.includes(file)) {
    failures.push(`AGENTS.md does not point to ${file}`);
  }
  if (!projectMap.includes(file)) {
    failures.push(`docs/PROJECT-MAP.md does not index ${file}`);
  }
}

if (!/^Version:\s+\d+\.\d+\s*$/m.test(protocol)) {
  failures.push('docs/CHANGE-PROTOCOL.md is missing a numeric Version header');
}
if (!/^Last updated:\s+\d{4}-\d{2}-\d{2}\s*$/m.test(protocol)) {
  failures.push('docs/CHANGE-PROTOCOL.md is missing an ISO Last updated header');
}

const activeRows = activeWork
  .split('\n')
  .filter((line) => new RegExp(`^\\| \\\`${taskIdPattern}\\\` \\|`).test(line))
  .map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    return {
      cellCount: cells.length,
      id: (cells[0] ?? '').replaceAll('`', ''),
      status: (cells[4] ?? '').replaceAll('`', ''),
      nextAction: cells[7] ?? '',
      updated: cells[8] ?? '',
    };
  });

const seenActiveIds = new Set();
for (const row of activeRows) {
  if (row.cellCount !== 9) {
    failures.push(
      `${row.id || 'unknown active-work row'} has ${row.cellCount} cells; expected 9`,
    );
    continue;
  }
  if (seenActiveIds.has(row.id)) {
    failures.push(`duplicate active-work task row: ${row.id}`);
  }
  seenActiveIds.add(row.id);
  if (!allowedStatuses.has(row.status)) {
    failures.push(`invalid active-work status for ${row.id}: ${row.status}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(row.updated)) {
    failures.push(`invalid active-work timestamp for ${row.id}: ${row.updated}`);
  }
  if (
    row.status === 'complete' &&
    /\b(commit|push|review|verify|test|watch|deploy|migrate)\b/i.test(
      row.nextAction,
    )
  ) {
    failures.push(
      `${row.id} is complete but its next action still crosses a required boundary: ${row.nextAction}`,
    );
  }
  if (!activeWork.includes(`### ${row.id}`)) {
    failures.push(`${row.id} has no task-detail section in ACTIVE-WORK`);
  }
}

const changelogHeadings = [
  ...changelog.matchAll(new RegExp(`^### (${taskIdPattern}) — .+$`, 'gm')),
].map((match) => match[1]);
const seenChangelogIds = new Set();
for (const id of changelogHeadings) {
  if (seenChangelogIds.has(id)) {
    failures.push(`duplicate engineering-changelog entry: ${id}`);
  }
  seenChangelogIds.add(id);
}

for (const match of changelog.matchAll(
  new RegExp(
    `^### (${taskIdPattern}) — .+\\n([\\s\\S]*?)(?=^### ${taskIdPattern} — |$(?![\\s\\S]))`,
    'gm',
  ),
)) {
  const id = match[1];
  const state = match[2].match(/^- State:\s+([a-z_]+)/m)?.[1];
  if (!state) {
    failures.push(`${id} changelog entry has no canonical State field`);
  } else if (!allowedStatuses.has(state)) {
    failures.push(`${id} changelog entry has invalid State: ${state}`);
  }
}

for (const row of activeRows) {
  if (
    ['validating', 'ready_for_review', 'ready_for_deploy', 'deployed_unverified']
      .includes(row.status) &&
    !seenChangelogIds.has(row.id)
  ) {
    failures.push(
      `${row.id} is ${row.status} but has no engineering-changelog entry`,
    );
  }
}

const schemaDocs = [
  'agent_docs/messages-db-schema.md',
  'agent_docs/nanoclaw-business-pg-schema.md',
];
for (const file of schemaDocs) {
  const text = read(file);
  if (/^Sample row:\s*$/m.test(text)) {
    failures.push(`${file} contains live sample rows; tracked schemas must be structure-only`);
  }
}

const nvmrc = read('.nvmrc').trim();
if (nvmrc !== '22') {
  failures.push(`.nvmrc must pin Node 22; found ${JSON.stringify(nvmrc)}`);
}
const ci = read('.github/workflows/ci.yml');
if (!ci.includes('node-version-file: .nvmrc')) {
  failures.push('CI must read the pinned Node version from .nvmrc');
}
const packageJson = read('package.json');
if (!packageJson.includes('sanitize-schema-doc.mjs --self-test')) {
  failures.push('docs:continuity-check does not run the schema sanitizer self-test');
}
const schemaRefresh = read('tools/refresh-schemas.sh');
if (!schemaRefresh.includes('scripts/sanitize-schema-doc.mjs')) {
  failures.push('schema refresh does not sanitize live SQLite sample rows');
}

if (failures.length > 0) {
  console.error('Documentation continuity check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Documentation continuity check passed: ${activeRows.length} active/ready task rows, ${changelogHeadings.length} changelog entries.`,
);
