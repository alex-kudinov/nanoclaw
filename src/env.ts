import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from './logger.js';

function parseEnvContent(
  content: string,
  wanted: Set<string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!wanted.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }
  return result;
}

/**
 * Parse env files and return values for the requested keys.
 * Loads ~/dev/.env.shared first (base), then overlays project .env.
 * Project .env always wins on conflict.
 * Does NOT load anything into process.env — keeps secrets off child processes.
 */
export function readEnvFile(keys: string[]): Record<string, string> {
  const wanted = new Set(keys);
  const result: Record<string, string> = {};

  // Base layer: ~/dev/.env.shared (shared across projects)
  const sharedFile = path.join(os.homedir(), 'dev', '.env.shared');
  try {
    const content = fs.readFileSync(sharedFile, 'utf-8');
    Object.assign(result, parseEnvContent(content, wanted));
  } catch {
    // optional — not an error if missing
  }

  // Overlay: project .env (wins on conflict)
  const envFile = path.join(process.cwd(), '.env');
  try {
    const content = fs.readFileSync(envFile, 'utf-8');
    Object.assign(result, parseEnvContent(content, wanted));
  } catch (err) {
    logger.debug({ err }, '.env file not found, using defaults');
  }

  return result;
}

/**
 * Comment out a key in the .env file (e.g. after a key returns 401).
 * The line is preserved as a comment so the user can see what was removed.
 */
export function removeEnvKey(key: string): void {
  const envFile = path.join(process.cwd(), '.env');
  try {
    const content = fs.readFileSync(envFile, 'utf-8');
    const lines = content.split('\n');
    const updated = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return line;
      if (trimmed.slice(0, eqIdx).trim() !== key) return line;
      return `# ${line}  # removed: expired token`;
    });
    fs.writeFileSync(envFile, updated.join('\n'), 'utf-8');
    logger.info({ key }, 'Commented out expired token in .env');
  } catch (err) {
    logger.error({ err, key }, 'Failed to remove expired token from .env');
  }
}
