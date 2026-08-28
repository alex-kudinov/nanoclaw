import fs from 'fs';
import path from 'path';

function isReleaseBundleRoot(directory: string): boolean {
  return (
    fs.existsSync(path.join(directory, 'RELEASE.json')) &&
    fs.existsSync(path.join(directory, 'FILES.sha256')) &&
    fs.existsSync(path.join(directory, 'dist', 'release-manifest.json'))
  );
}

function enclosingReleaseBundleRoot(directory: string): string | null {
  let current = path.resolve(directory);
  for (;;) {
    if (isReleaseBundleRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve the structured log sink without writing runtime state into a
 * provenance-bearing release bundle. An explicit override remains the only
 * way to route a release-root diagnostic to a known operational path.
 */
export function resolveJsonlPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  if (env.NANOCLAW_JSONL_PATH !== undefined) {
    return env.NANOCLAW_JSONL_PATH;
  }
  if (enclosingReleaseBundleRoot(cwd)) return '';
  return path.join(cwd, 'logs', 'nanoclaw.jsonl');
}
