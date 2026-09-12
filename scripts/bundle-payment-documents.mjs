#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'dist', 'payment-checkout-documents.js');
const output = path.join(root, 'dist', 'payment-checkout-documents.bundle.js');
if (!fs.statSync(entry).isFile()) throw new Error('compiled document entry missing');

const result = await build({
  entryPoints: [entry],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  metafile: true,
  logLevel: 'silent',
  legalComments: 'eof',
  external: [
    './action-safety.js',
    './config.js',
    './gmail-auth.js',
    './gmail-api.js',
    './payment-checkout-billing.js',
    './payment-checkout-evidence.js',
    './payment-domain.js',
    './payment-payload-vault.js',
    './payment-store.js',
    'googleapis',
    'pg',
    'zod',
  ],
});
const allowedPackages = [
  '@pdf-lib/fontkit',
  '@pdf-lib/standard-fonts',
  '@pdf-lib/upng',
  'pdf-lib',
  'pako',
  'tslib',
];
for (const input of Object.keys(result.metafile.inputs)) {
  if (!input.includes('node_modules')) continue;
  if (!allowedPackages.some((name) => input.includes(`node_modules/${name}/`)))
    throw new Error(`unexpected document bundle dependency: ${input}`);
}
const bytes = fs.readFileSync(output);
if (bytes.length < 300_000 || bytes.length > 4_000_000)
  throw new Error('document bundle size invalid');
fs.renameSync(output, entry);
process.stdout.write(
  `${JSON.stringify({ bundled: true, target: 'payment-checkout-documents.js', bytes: bytes.length })}\n`,
);
