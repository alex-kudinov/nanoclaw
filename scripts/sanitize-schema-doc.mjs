#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

export function stripSampleRows(markdown) {
  const output = [];
  let skipping = false;
  let fences = 0;

  for (const line of markdown.split('\n')) {
    if (!skipping && line === 'Sample row:') {
      skipping = true;
      fences = 0;
      if (output.at(-1) === '') output.pop();
      continue;
    }
    if (skipping) {
      if (line === '```') {
        fences += 1;
        if (fences === 2) skipping = false;
      }
      continue;
    }
    output.push(line.replace(/[ \t]+$/, ''));
  }
  if (skipping) throw new Error('unterminated Sample row code fence');
  return output.join('\n');
}

function runSelfTest() {
  const fixture = [
    '# Schema',
    '',
    '## first',
    '',
    '```',
    '  id INTEGER',
    '```',
    '',
    'Sample row:',
    '```',
    'id  name',
    '1   private',
    '```',
    '',
    '## second',
    '',
    '```',
    '  key TEXT',
    '```',
    '',
    'Sample row:',
    '```',
    '```',
    '',
  ].join('\n');
  const result = stripSampleRows(fixture);
  if (result.includes('Sample row:') || result.includes('private')) {
    throw new Error('sample-row sanitizer retained sample data');
  }
  if (!result.includes('## first') || !result.includes('## second')) {
    throw new Error('sample-row sanitizer removed schema structure');
  }
  process.stdout.write('Schema sanitizer self-test passed.\n');
}

const inPlaceIndex = process.argv.indexOf('--in-place');

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else if (inPlaceIndex !== -1) {
  const path = process.argv[inPlaceIndex + 1];
  if (!path) throw new Error('--in-place requires a file path');
  const input = fs.readFileSync(path, 'utf8');
  fs.writeFileSync(path, stripSampleRows(input));
} else {
  const input = fs.readFileSync(0, 'utf8');
  process.stdout.write(stripSampleRows(input));
}
