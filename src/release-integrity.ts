import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const RELEASE_MANIFEST_SCHEMA = 1;
export const RELEASE_MANIFEST_FILE = 'release-manifest.json';

export interface ReleaseManifest {
  schemaVersion: typeof RELEASE_MANIFEST_SCHEMA;
  commit: string;
  sourceTree: string;
  builtAt: string;
  nodePin: string;
  nodeVersion: string;
  artifactHash: string;
  artifactFiles: number;
}

export interface ReleaseIdentity {
  mode: 'release' | 'development';
  verified: boolean;
  commit: string | null;
  sourceTree: string | null;
  artifactHash: string | null;
  builtAt: string | null;
  nodePin: string;
  nodeVersion: string;
}

function listFiles(root: string, relative = ''): string[] {
  const dir = path.join(root, relative);
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files: string[] = [];
  for (const entry of entries) {
    const rel = relative ? path.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(root, rel));
    else if (entry.isFile() && rel !== RELEASE_MANIFEST_FILE) files.push(rel);
    else if (!entry.isFile()) {
      throw new Error(
        `NanoClaw compiled artifact contains unsupported entry: ${rel}`,
      );
    }
  }
  return files;
}

/** Stable digest of the complete compiled artifact, excluding its manifest. */
export function computeArtifactDigest(distDir: string): {
  hash: string;
  files: number;
} {
  const files = listFiles(distDir);
  const digest = crypto.createHash('sha256');
  for (const relative of files) {
    const bytes = fs.readFileSync(path.join(distDir, relative));
    digest.update(relative.split(path.sep).join('/'));
    digest.update('\0');
    digest.update(String(bytes.length));
    digest.update('\0');
    digest.update(bytes);
    digest.update('\0');
  }
  return { hash: digest.digest('hex'), files: files.length };
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, '');
}

export function assertExactNodeVersion(
  actualVersion: string,
  expectedVersion: string,
): void {
  const actual = normalizeVersion(actualVersion);
  const expected = normalizeVersion(expectedVersion);
  if (actual !== expected) {
    throw new Error(
      `NanoClaw requires Node ${expected}; refusing to start under Node ${actual}`,
    );
  }
}

function readDevelopmentPin(cwd: string): string {
  const pinPath = path.join(cwd, '.nvmrc');
  if (!fs.existsSync(pinPath)) {
    throw new Error(`NanoClaw runtime pin missing: ${pinPath}`);
  }
  return normalizeVersion(fs.readFileSync(pinPath, 'utf8'));
}

export function verifyRuntimeRelease(opts?: {
  distDir?: string;
  cwd?: string;
  nodeVersion?: string;
  requireManifest?: boolean;
  expectedCommit?: string;
}): ReleaseIdentity {
  const distDir = opts?.distDir ?? path.dirname(fileURLToPath(import.meta.url));
  const cwd = opts?.cwd ?? process.cwd();
  const nodeVersion = opts?.nodeVersion ?? process.version;
  const manifestPath = path.join(distDir, RELEASE_MANIFEST_FILE);
  const requireManifest =
    opts?.requireManifest ??
    (process.env.NANOCLAW_REQUIRE_RELEASE_MANIFEST === '1' ||
      process.env.NODE_ENV === 'production');

  if (!fs.existsSync(manifestPath)) {
    const nodePin = readDevelopmentPin(cwd);
    assertExactNodeVersion(nodeVersion, nodePin);
    if (requireManifest) {
      throw new Error(
        `NanoClaw production release manifest missing: ${manifestPath}`,
      );
    }
    return {
      mode: 'development',
      verified: false,
      commit: null,
      sourceTree: null,
      artifactHash: null,
      builtAt: null,
      nodePin,
      nodeVersion: normalizeVersion(nodeVersion),
    };
  }

  const manifest = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  ) as ReleaseManifest;
  if (manifest.schemaVersion !== RELEASE_MANIFEST_SCHEMA) {
    throw new Error(
      `Unsupported NanoClaw release manifest schema: ${String(manifest.schemaVersion)}`,
    );
  }
  if (!/^[0-9a-f]{40}$/i.test(manifest.commit)) {
    throw new Error('NanoClaw release manifest has an invalid commit');
  }
  if (!/^[0-9a-f]{40}$/i.test(manifest.sourceTree)) {
    throw new Error('NanoClaw release manifest has an invalid source tree');
  }
  if (
    !/^[0-9a-f]{64}$/i.test(manifest.artifactHash) ||
    !Number.isSafeInteger(manifest.artifactFiles) ||
    manifest.artifactFiles < 1
  ) {
    throw new Error('NanoClaw release manifest has an invalid artifact digest');
  }
  if (
    typeof manifest.builtAt !== 'string' ||
    Number.isNaN(Date.parse(manifest.builtAt))
  ) {
    throw new Error('NanoClaw release manifest has an invalid build timestamp');
  }
  if (
    typeof manifest.nodePin !== 'string' ||
    typeof manifest.nodeVersion !== 'string'
  ) {
    throw new Error('NanoClaw release manifest has invalid Node metadata');
  }
  assertExactNodeVersion(nodeVersion, manifest.nodePin);
  if (
    normalizeVersion(manifest.nodeVersion) !==
    normalizeVersion(manifest.nodePin)
  ) {
    throw new Error(
      `NanoClaw release was built under Node ${manifest.nodeVersion}, not pinned Node ${manifest.nodePin}`,
    );
  }

  const expectedCommit =
    opts?.expectedCommit ?? process.env.NANOCLAW_EXPECTED_RELEASE_COMMIT;
  if (expectedCommit && manifest.commit !== expectedCommit.trim()) {
    throw new Error(
      `NanoClaw release commit ${manifest.commit} does not match expected ${expectedCommit.trim()}`,
    );
  }

  const artifact = computeArtifactDigest(distDir);
  if (
    artifact.hash !== manifest.artifactHash ||
    artifact.files !== manifest.artifactFiles
  ) {
    throw new Error(
      `NanoClaw compiled artifact does not match its release manifest ` +
        `(expected ${manifest.artifactHash}/${manifest.artifactFiles}, ` +
        `got ${artifact.hash}/${artifact.files})`,
    );
  }

  return {
    mode: 'release',
    verified: true,
    commit: manifest.commit,
    sourceTree: manifest.sourceTree,
    artifactHash: manifest.artifactHash,
    builtAt: manifest.builtAt,
    nodePin: normalizeVersion(manifest.nodePin),
    nodeVersion: normalizeVersion(nodeVersion),
  };
}
