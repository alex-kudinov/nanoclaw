#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  prepareEnchargeSnapshot,
  type PartyEmailCandidate,
} from '../src/relationship-context-provider-reconciliation.js';

function valueAfter(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`missing ${flag}`);
  return value;
}

const partyFile = valueAfter('--party-file');
const providerDir = valueAfter('--provider-dir');
const outputFile = valueAfter('--output-file');
if (!path.isAbsolute(outputFile) || fs.existsSync(outputFile)) {
  throw new Error('output file must be a new absolute path');
}
const partyEmails = JSON.parse(
  fs.readFileSync(partyFile, 'utf8'),
) as PartyEmailCandidate[];
const providerPeople = fs
  .readdirSync(providerDir)
  .filter((name) => /^provider-[0-9]+\.json$/.test(name))
  .sort()
  .flatMap(
    (name) =>
      JSON.parse(
        fs.readFileSync(path.join(providerDir, name), 'utf8'),
      ) as Array<Record<string, unknown>>,
  );
const prepared = prepareEnchargeSnapshot({
  generatedAt: new Date().toISOString(),
  partyEmails,
  providerPeople,
});
const descriptor = fs.openSync(
  outputFile,
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
  0o600,
);
fs.writeFileSync(descriptor, `${JSON.stringify(prepared.snapshot)}\n`);
fs.closeSync(descriptor);
process.stdout.write(
  `${JSON.stringify({
    schemaVersion: 1,
    partyEmailRows: partyEmails.length,
    providerPeople: providerPeople.length,
    matched: prepared.matched,
    unmatchedProviderPeople: prepared.unmatchedProviderPeople,
    ambiguousPartyEmails: prepared.ambiguousPartyEmails,
    invalidProviderPeople: prepared.invalidProviderPeople,
  })}\n`,
);
