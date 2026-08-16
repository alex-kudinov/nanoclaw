#!/usr/bin/env node

import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runEmailCriticalTests } from './run-email-critical-tests.mjs';

const root = process.cwd();
const pin = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
const actual = process.version.replace(/^v/, '');
if (actual !== pin) {
  throw new Error(
    `release build requires Node ${pin}; current runtime is ${actual}`,
  );
}

const status = execFileSync(
  'git',
  ['status', '--porcelain=v1', '--untracked-files=all'],
  { cwd: root, encoding: 'utf8' },
).trim();
if (status) {
  throw new Error(
    'release build requires a clean committed worktree; refusing to package local or staged changes',
  );
}

const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
  cwd: root,
  encoding: 'utf8',
}).trim();

// Email is a business-critical side effect. A release is not packageable if
// approval binding, exact-action idempotency, Gmail receipt handling, or the
// cross-group delivery path regresses. The worktree is already proven clean,
// so these tests exercise the exact source tree named by the manifest.
runEmailCriticalTests({ root });

const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [
    path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p',
    path.join(root, 'tsconfig.build.json'),
  ],
  { cwd: root, stdio: 'inherit' },
);

const { computeArtifactDigest } = await import(
  new URL('../dist/release-integrity.js', import.meta.url)
);
const artifact = computeArtifactDigest(dist);
const manifest = {
  schemaVersion: 1,
  commit,
  sourceTree,
  builtAt: new Date().toISOString(),
  nodePin: pin,
  nodeVersion: actual,
  artifactHash: artifact.hash,
  artifactFiles: artifact.files,
};
fs.writeFileSync(
  path.join(dist, 'release-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);

execFileSync(
  process.execPath,
  [path.join(root, 'scripts', 'verify-release.mjs'), dist, '--runtime'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-release-'));
const outputDir = path.join(root, '.release');
fs.mkdirSync(outputDir, { recursive: true });
const archive = path.join(outputDir, `nanoclaw-${commit.slice(0, 12)}.tar.gz`);

try {
  fs.cpSync(dist, path.join(stage, 'dist'), { recursive: true });
  const tracked = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--',
      '.nvmrc',
      'package.json',
      'package-lock.json',
      'capabilities',
      'container',
      'groups',
      'knowledge',
      'launchd',
      'setup/launchd',
      'tools/contador',
    ],
    { cwd: root },
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  tracked.push(
    'scripts/verify-release.mjs',
    'scripts/activate-release.mjs',
    'scripts/register-caleprocure-collector.mjs',
    'scripts/start-procurement-browser.sh',
  );
  for (const relative of [...new Set(tracked)].sort()) {
    const source = path.join(root, relative);
    if (!fs.lstatSync(source).isFile()) {
      throw new Error(`release input must be a regular file: ${relative}`);
    }
    const destination = path.join(stage, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  fs.writeFileSync(
    path.join(stage, 'RELEASE.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  const bundleFiles = [];
  const walk = (relative = '') => {
    const dir = path.join(stage, relative);
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile() && rel !== 'FILES.sha256') bundleFiles.push(rel);
      else if (!entry.isFile()) {
        throw new Error(`release bundle contains unsupported entry: ${rel}`);
      }
    }
  };
  walk();
  const lines = bundleFiles.map((relative) => {
    const hash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(stage, relative)))
      .digest('hex');
    return `${hash}  ${relative.split(path.sep).join('/')}`;
  });
  fs.writeFileSync(path.join(stage, 'FILES.sha256'), lines.join('\n') + '\n');
  execFileSync('tar', ['-czf', archive, '-C', stage, '.'], {
    cwd: root,
    stdio: 'inherit',
  });
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

const archiveHash = crypto
  .createHash('sha256')
  .update(fs.readFileSync(archive))
  .digest('hex');
process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      archive,
      archiveHash,
      commit,
      sourceTree,
      artifactHash: artifact.hash,
      artifactFiles: artifact.files,
      nodePin: pin,
    },
    null,
    2,
  ) + '\n',
);
