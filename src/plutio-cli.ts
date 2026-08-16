/**
 * Shared host-side caller for the Plutio toolbox bash tools.
 *
 * env.ts deliberately keeps secrets off process.env, so Plutio creds are
 * injected explicitly here for the bash scripts' `plutio_load_env` (which only
 * sources `.env` from cwd). cwd is forced to the toolbox dir so the daemon's
 * own NanoClaw/.env (bash-incompatible) is not sourced by accident.
 *
 * Note: src/plutio-outbox-reaper.ts predates this and carries an equivalent
 * private copy; it can migrate to this helper later.
 */

import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

import { assertExternalWriteAllowed } from './action-safety.js';
import { readEnvFile } from './env.js';

const execFileAsync = promisify(execFile);

const TOOLBOX_DIR =
  process.env.TOOLBOX_DIR || path.join(process.env.HOME || '', 'dev/toolbox');
const PLUTIO_TOOL_DIR = path.join(TOOLBOX_DIR, 'shared/plutio/tools/plutio');
const READ_ONLY_SCRIPTS = new Set(['list-proposals.sh', 'list-people.sh']);

type PlutioExecFile = (
  file: string,
  args: readonly string[],
  options: {
    env: NodeJS.ProcessEnv;
    cwd: string;
    timeout: number;
  },
) => Promise<{ stdout: string; stderr: string }>;

/** Run a Plutio toolbox script (e.g. 'list-proposals.sh') and return stdout. */
export async function callPlutioTool(
  script: string,
  args: string[],
  timeoutMs = 30_000,
  deps?: {
    /** Production defaults to execFileAsync; the installed safety drill injects a no-child tripwire. */
    execFile?: PlutioExecFile;
  },
): Promise<string> {
  const toolPath = path.join(PLUTIO_TOOL_DIR, script);
  if (!READ_ONLY_SCRIPTS.has(script)) {
    assertExternalWriteAllowed({
      system: 'plutio',
      actionClass: /(?:invoice|proposal|contract)/.test(script)
        ? 'c4_financial'
        : /delete-/.test(script)
          ? 'c5_destructive'
          : 'c2_external_write',
      source: 'host:plutio-cli',
    });
  }
  const creds = readEnvFile([
    'PLUTIO_API_CLIENTID',
    'PLUTIO_API_CLIENTSECRET',
    'PLUTIO_SUBDOMAIN',
  ]);
  const env = {
    ...process.env,
    ...creds,
    TOOLBOX_LIB: path.join(TOOLBOX_DIR, 'lib'),
  };
  const { stdout } = await (deps?.execFile ?? execFileAsync)(toolPath, args, {
    env,
    cwd: TOOLBOX_DIR,
    timeout: timeoutMs,
  });
  return stdout.trim();
}

/**
 * Plutio toolbox scripts prefix stdout with a status token (`OK [...]` /
 * `OK {...}` on success, `ERR ...` on failure). Slice from the first JSON
 * bracket so the status word doesn't break JSON.parse. Returns '' when there is
 * no JSON (e.g. an ERR line) — JSON.parse('') then throws, surfacing the error.
 */
export function stripToJson(raw: string): string {
  const s = (raw || '').trim();
  const arr = s.indexOf('[');
  const obj = s.indexOf('{');
  const start = arr === -1 ? obj : obj === -1 ? arr : Math.min(arr, obj);
  return start === -1 ? '' : s.slice(start);
}
