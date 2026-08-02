import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  assertExactNodeVersion,
  computeArtifactDigest,
  RELEASE_MANIFEST_FILE,
  verifyRuntimeRelease,
  type ReleaseManifest,
} from './release-integrity.js';

const roots: string[] = [];

function makeRoot(): { root: string; dist: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nanoclaw-release-'));
  roots.push(root);
  const dist = path.join(root, 'dist');
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(root, '.nvmrc'), '22.23.2\n');
  fs.writeFileSync(path.join(dist, 'index.js'), 'console.log("ok");\n');
  return { root, dist };
}

function writeManifest(dist: string): ReleaseManifest {
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
  fs.writeFileSync(
    path.join(dist, RELEASE_MANIFEST_FILE),
    JSON.stringify(manifest),
  );
  return manifest;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('release integrity', () => {
  it('accepts an exact manifest, artifact, commit, and Node pin', () => {
    const { root, dist } = makeRoot();
    const manifest = writeManifest(dist);
    const identity = verifyRuntimeRelease({
      cwd: root,
      distDir: dist,
      nodeVersion: 'v22.23.2',
      requireManifest: true,
      expectedCommit: manifest.commit,
    });
    expect(identity).toMatchObject({
      mode: 'release',
      verified: true,
      commit: manifest.commit,
      artifactHash: manifest.artifactHash,
      nodePin: '22.23.2',
    });
  });

  it('refuses a hand-edited compiled artifact', () => {
    const { root, dist } = makeRoot();
    writeManifest(dist);
    fs.appendFileSync(path.join(dist, 'index.js'), '// hand patch\n');
    expect(() =>
      verifyRuntimeRelease({
        cwd: root,
        distDir: dist,
        nodeVersion: '22.23.2',
        requireManifest: true,
      }),
    ).toThrow('does not match its release manifest');
  });

  it('refuses symlinks that could escape the compiled artifact digest', () => {
    const { root, dist } = makeRoot();
    writeManifest(dist);
    fs.symlinkSync(path.join(root, '.nvmrc'), path.join(dist, 'late-link.js'));
    expect(() =>
      verifyRuntimeRelease({
        cwd: root,
        distDir: dist,
        nodeVersion: '22.23.2',
        requireManifest: true,
      }),
    ).toThrow('unsupported entry');
  });

  it('refuses a release whose commit differs from deployment expectation', () => {
    const { root, dist } = makeRoot();
    writeManifest(dist);
    expect(() =>
      verifyRuntimeRelease({
        cwd: root,
        distDir: dist,
        nodeVersion: '22.23.2',
        requireManifest: true,
        expectedCommit: 'c'.repeat(40),
      }),
    ).toThrow('does not match expected');
  });

  it('refuses malformed digest metadata before trusting the artifact', () => {
    const { root, dist } = makeRoot();
    const manifest = writeManifest(dist);
    fs.writeFileSync(
      path.join(dist, RELEASE_MANIFEST_FILE),
      JSON.stringify({ ...manifest, artifactFiles: -1 }),
    );
    expect(() =>
      verifyRuntimeRelease({
        cwd: root,
        distDir: dist,
        nodeVersion: '22.23.2',
        requireManifest: true,
      }),
    ).toThrow('invalid artifact digest');
  });

  it('refuses any Node runtime other than the exact pin', () => {
    expect(() => assertExactNodeVersion('v25.8.2', '22.23.2')).toThrow(
      'refusing to start',
    );
  });

  it('allows a manifest-free development import only under the pinned Node', () => {
    const { root, dist } = makeRoot();
    const identity = verifyRuntimeRelease({
      cwd: root,
      distDir: dist,
      nodeVersion: '22.23.2',
      requireManifest: false,
    });
    expect(identity).toMatchObject({
      mode: 'development',
      verified: false,
      nodePin: '22.23.2',
    });
  });

  it('requires a manifest in production mode', () => {
    const { root, dist } = makeRoot();
    expect(() =>
      verifyRuntimeRelease({
        cwd: root,
        distDir: dist,
        nodeVersion: '22.23.2',
        requireManifest: true,
      }),
    ).toThrow('manifest missing');
  });
});
