/**
 * Register Plutio toolbox mounts for sales and certifier containers.
 * Run on Mac Mini: npx tsx scripts/register-plutio-mounts.ts
 *
 * Adds two mounts to each group's containerConfig.additionalMounts:
 *   - plutio toolbox (readonly)
 *   - toolbox-lib (readonly)
 *
 * Safe to run multiple times — checks for existing mounts before adding.
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'store', 'messages.db');
const db = new Database(DB_PATH);

const PLUTIO_MOUNT = {
  hostPath: `${process.env.HOME}/dev/toolbox/shared/plutio`,
  containerPath: 'plutio',
  readonly: true,
};

const TOOLBOX_LIB_MOUNT = {
  hostPath: `${process.env.HOME}/dev/toolbox/lib`,
  containerPath: 'toolbox-lib',
  readonly: true,
};

const GROUPS = ['sales', 'certifier'];

for (const group of GROUPS) {
  const row = db
    .prepare('SELECT container_config FROM registered_groups WHERE folder = ?')
    .get(group) as { container_config: string } | undefined;

  if (!row) {
    console.log(`[SKIP] Group '${group}' not found in registered_groups`);
    continue;
  }

  const config = JSON.parse(row.container_config || '{}');
  const mounts: Array<{
    hostPath: string;
    containerPath: string;
    readonly: boolean;
  }> = config.additionalMounts || [];

  let changed = false;

  // Add plutio mount if not present
  if (!mounts.some((m) => m.containerPath === 'plutio')) {
    mounts.push(PLUTIO_MOUNT);
    changed = true;
  }

  // Add toolbox-lib mount if not present
  if (!mounts.some((m) => m.containerPath === 'toolbox-lib')) {
    mounts.push(TOOLBOX_LIB_MOUNT);
    changed = true;
  }

  if (!changed) {
    console.log(`[OK] Group '${group}' already has Plutio mounts`);
    continue;
  }

  config.additionalMounts = mounts;
  db.prepare(
    'UPDATE registered_groups SET container_config = ? WHERE folder = ?',
  ).run(JSON.stringify(config), group);

  console.log(
    `[UPDATED] Group '${group}' — added Plutio mounts (${mounts.length} total mounts)`,
  );
}

db.close();
console.log('Done. Restart NanoClaw to pick up mount changes.');
