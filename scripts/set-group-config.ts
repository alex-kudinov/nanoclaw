/**
 * Set a single containerConfig key on a registered group, preserving every
 * other key (read-merge-write). Used to roll out per-group config changes
 * (processingMessage, model) reproducibly.
 *
 *   npx tsx scripts/set-group-config.ts --jid <jid> --set <key>=<value>
 *
 * The merge is per-row: existing additionalMounts / timeout / spawnTimeout /
 * processingMessage / model are retained; only <key> is changed.
 */

import {
  initDatabase,
  getRegisteredGroup,
  setRegisteredGroup,
} from '../src/db.js';
import type { ContainerConfig, RegisteredGroup } from '../src/types.js';

export interface SetGroupConfigArgs {
  jid: string;
  key: string;
  value: string;
}

export function parseArgs(argv: string[]): SetGroupConfigArgs {
  let jid: string | undefined;
  let set: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--jid') jid = argv[++i];
    else if (argv[i] === '--set') set = argv[++i];
  }
  if (!jid || !set) {
    throw new Error(
      'Usage: tsx scripts/set-group-config.ts --jid <jid> --set <key>=<value>',
    );
  }
  const eq = set.indexOf('=');
  if (eq < 1) throw new Error(`--set must be key=value, got: ${set}`);
  return { jid, key: set.slice(0, eq), value: set.slice(eq + 1) };
}

/**
 * Merge a single key into a group's containerConfig, preserving prior keys.
 * Pure — does not touch the DB. Exported for testing.
 */
export function mergeContainerConfig(
  group: RegisteredGroup,
  key: string,
  value: string,
): RegisteredGroup {
  const containerConfig: ContainerConfig = {
    ...group.containerConfig,
    [key]: value,
  };
  return { ...group, containerConfig };
}

export function setGroupConfig(args: SetGroupConfigArgs): void {
  initDatabase();
  const group = getRegisteredGroup(args.jid);
  if (!group) {
    throw new Error(`No registered group for JID: ${args.jid}`);
  }
  const updated = mergeContainerConfig(group, args.key, args.value);
  setRegisteredGroup(args.jid, updated);
}

// Run only when invoked directly (not when imported by the test).
const invokedDirectly =
  process.argv[1] !== undefined &&
  process.argv[1].endsWith('set-group-config.ts');
if (invokedDirectly) {
  try {
    const args = parseArgs(process.argv.slice(2));
    setGroupConfig(args);
    console.log(
      JSON.stringify({ ok: true, jid: args.jid, key: args.key }, null, 2),
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
