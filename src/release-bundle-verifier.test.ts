import crypto from 'crypto';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  computeArtifactDigest,
  RELEASE_MANIFEST_FILE,
  type ReleaseManifest,
} from './release-integrity.js';

const roots: string[] = [];
const verifier = path.resolve('scripts/verify-release.mjs');

function sha256(file: string): string {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function makeBundle(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-bundle-'));
  roots.push(root);
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'index.js'), 'console.log("release");\n');
  const artifact = computeArtifactDigest(dist);
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    commit: 'a'.repeat(40),
    sourceTree: 'b'.repeat(40),
    builtAt: '2026-07-31T00:00:00.000Z',
    nodePin: '22.23.2',
    nodeVersion: '22.23.2',
    artifactHash: artifact.hash,
    artifactFiles: artifact.files,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(dist, RELEASE_MANIFEST_FILE), serialized);
  fs.writeFileSync(path.join(root, 'RELEASE.json'), serialized);
  fs.mkdirSync(path.join(root, 'groups', 'sales'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'groups', 'sales', 'CLAUDE.md'),
    '# Sales\n',
  );

  const files = [
    'RELEASE.json',
    'dist/index.js',
    `dist/${RELEASE_MANIFEST_FILE}`,
    'groups/sales/CLAUDE.md',
  ];
  fs.writeFileSync(
    path.join(root, 'FILES.sha256'),
    `${files.map((file) => `${sha256(path.join(root, file))}  ${file}`).join('\n')}\n`,
  );
  return root;
}

function verify(root: string): string {
  return execFileSync(process.execPath, [verifier, root, '--runtime'], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('release bundle verifier', () => {
  it('accepts a complete bundle inventory under the exact runtime', () => {
    expect(JSON.parse(verify(makeBundle()))).toMatchObject({
      ok: true,
      commit: 'a'.repeat(40),
      nodePin: '22.23.2',
    });
  });

  it('refuses unlisted files added to the release bundle', () => {
    const root = makeBundle();
    fs.writeFileSync(path.join(root, 'unlisted.js'), 'unexpected\n');
    expect(() => verify(root)).toThrow(
      'release bundle inventory mismatch: unlisted=unlisted.js absent=none',
    );
  });

  it('refuses paths that escape the extracted release root', () => {
    const root = makeBundle();
    fs.appendFileSync(
      path.join(root, 'FILES.sha256'),
      `${'0'.repeat(64)}  ../outside\n`,
    );
    expect(() => verify(root)).toThrow('unsafe FILES.sha256 path');
  });

  it('refuses symlinks even when they are not listed in the inventory', () => {
    const root = makeBundle();
    fs.symlinkSync(
      path.join(root, 'groups', 'sales', 'CLAUDE.md'),
      path.join(root, 'linked-prompt.md'),
    );
    expect(() => verify(root)).toThrow('unsupported entry');
  });
});
