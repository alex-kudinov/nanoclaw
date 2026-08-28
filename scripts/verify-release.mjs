#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function listFiles(root, relative = '') {
  const dir = path.join(root, relative);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const rel = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return listFiles(root, rel);
      if (entry.isFile()) return [rel];
      throw new Error(`release bundle contains unsupported entry: ${rel}`);
    });
}

function hashFiles(root, files) {
  const digest = crypto.createHash('sha256');
  for (const relative of files) {
    const bytes = fs.readFileSync(path.join(root, relative));
    digest.update(relative.split(path.sep).join('/'));
    digest.update('\0');
    digest.update(String(bytes.length));
    digest.update('\0');
    digest.update(bytes);
    digest.update('\0');
  }
  return digest.digest('hex');
}

function sha256(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function assertManifest(manifest) {
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    manifest.schemaVersion !== 1
  ) {
    throw new Error(
      `unsupported release manifest schema: ${String(manifest?.schemaVersion)}`,
    );
  }
  for (const field of ['commit', 'sourceTree']) {
    if (!/^[0-9a-f]{40}$/i.test(manifest[field])) {
      throw new Error(`release manifest has invalid ${field}`);
    }
  }
  if (!/^[0-9a-f]{64}$/i.test(manifest.artifactHash)) {
    throw new Error('release manifest has invalid artifactHash');
  }
  if (
    !Number.isSafeInteger(manifest.artifactFiles) ||
    manifest.artifactFiles < 1
  ) {
    throw new Error('release manifest has invalid artifactFiles');
  }
  if (
    typeof manifest.nodePin !== 'string' ||
    typeof manifest.nodeVersion !== 'string' ||
    manifest.nodePin !== manifest.nodeVersion
  ) {
    throw new Error('release manifest has inconsistent Node versions');
  }
}

function safeBundlePath(root, relative) {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).includes('..')
  ) {
    throw new Error(`unsafe FILES.sha256 path: ${relative}`);
  }
  const resolved = path.resolve(root, relative);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) {
    throw new Error(`unsafe FILES.sha256 path: ${relative}`);
  }
  return resolved;
}

const root = path.resolve(process.argv[2] || '.');
const dist = fs.existsSync(path.join(root, 'dist'))
  ? path.join(root, 'dist')
  : root;
const manifestPath = path.join(dist, 'release-manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`release manifest missing: ${manifestPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assertManifest(manifest);
const artifactFiles = listFiles(dist).filter(
  (relative) => relative !== 'release-manifest.json',
);
const artifactHash = hashFiles(dist, artifactFiles);
if (
  artifactHash !== manifest.artifactHash ||
  artifactFiles.length !== manifest.artifactFiles
) {
  throw new Error(
    `compiled artifact mismatch: expected ${manifest.artifactHash}/${manifest.artifactFiles}, ` +
      `got ${artifactHash}/${artifactFiles.length}`,
  );
}

const fileListPath = path.join(root, 'FILES.sha256');
if (fs.existsSync(fileListPath)) {
  const expectedBundleFiles = listFiles(root)
    .filter((relative) => relative !== 'FILES.sha256')
    .map((relative) => relative.split(path.sep).join('/'));
  const listed = new Set();
  for (const line of fs.readFileSync(fileListPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (!match) throw new Error(`invalid FILES.sha256 line: ${line}`);
    if (listed.has(match[2])) {
      throw new Error(`duplicate FILES.sha256 entry: ${match[2]}`);
    }
    listed.add(match[2]);
    const file = safeBundlePath(root, match[2]);
    if (
      !fs.existsSync(file) ||
      !fs.lstatSync(file).isFile() ||
      sha256(file) !== match[1]
    ) {
      throw new Error(`release bundle file mismatch: ${match[2]}`);
    }
  }
  const unlisted = expectedBundleFiles.filter(
    (relative) => !listed.has(relative),
  );
  const absent = [...listed].filter(
    (relative) => !expectedBundleFiles.includes(relative),
  );
  if (unlisted.length || absent.length) {
    throw new Error(
      `release bundle inventory mismatch: unlisted=${unlisted.join(',') || 'none'} ` +
        `absent=${absent.join(',') || 'none'}`,
    );
  }
}

const releasePath = path.join(root, 'RELEASE.json');
if (fs.existsSync(releasePath)) {
  const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
  assertManifest(release);
  if (JSON.stringify(release) !== JSON.stringify(manifest)) {
    throw new Error('RELEASE.json does not match dist/release-manifest.json');
  }
}

if (process.argv.includes('--runtime')) {
  const actual = process.version.replace(/^v/, '');
  if (actual !== manifest.nodePin) {
    throw new Error(
      `release requires Node ${manifest.nodePin}; verifier is running under ${actual}`,
    );
  }
}

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      commit: manifest.commit,
      sourceTree: manifest.sourceTree,
      artifactHash,
      artifactFiles: artifactFiles.length,
      nodePin: manifest.nodePin,
    },
    null,
    2,
  ) + '\n',
);
