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

import { readEnvFile } from './env.js';

const execFileAsync = promisify(execFile);

const TOOLBOX_DIR =
  process.env.TOOLBOX_DIR || path.join(process.env.HOME || '', 'dev/toolbox');
const PLUTIO_TOOL_DIR = path.join(TOOLBOX_DIR, 'shared/plutio/tools/plutio');

/** Run a Plutio toolbox script (e.g. 'list-proposals.sh') and return stdout. */
export async function callPlutioTool(
  script: string,
  args: string[],
  timeoutMs = 30_000,
): Promise<string> {
  const toolPath = path.join(PLUTIO_TOOL_DIR, script);
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
  const { stdout } = await execFileAsync(toolPath, args, {
    env,
    cwd: TOOLBOX_DIR,
    timeout: timeoutMs,
  });
  return stdout.trim();
}
