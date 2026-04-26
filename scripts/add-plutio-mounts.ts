/**
 * Add Plutio toolbox mounts to sales and certifier containers.
 * Preserves existing mounts (read-modify-write pattern).
 *
 * Usage: npx tsx scripts/add-plutio-mounts.ts
 */
import { initDatabase, getRegisteredGroup, setRegisteredGroup } from '../src/db.js';

const PLUTIO_MOUNTS = [
  { hostPath: '~/dev/toolbox/shared/plutio', containerPath: 'plutio', readonly: true },
  { hostPath: '~/dev/toolbox/lib', containerPath: 'toolbox-lib', readonly: true },
];

const TARGETS: Record<string, string> = {
  sales: 'slack:C0AHV1SGT6W',
  certifier: 'slack:C0AKPNJ7MDW',
};

initDatabase();

for (const [name, jid] of Object.entries(TARGETS)) {
  const current = getRegisteredGroup(jid);
  if (!current) {
    console.error(`[SKIP] ${name} (${jid}) not found in registered_groups`);
    continue;
  }

  const existingMounts = current.containerConfig?.additionalMounts ?? [];
  const existingPaths = new Set(existingMounts.map((m: { containerPath?: string }) => m.containerPath));

  const newMounts = [...existingMounts];
  let added = 0;

  for (const mount of PLUTIO_MOUNTS) {
    if (existingPaths.has(mount.containerPath)) {
      console.log(`  [EXISTS] ${name}: ${mount.containerPath} already mounted`);
    } else {
      newMounts.push(mount);
      added++;
      console.log(`  [ADD] ${name}: ${mount.containerPath}`);
    }
  }

  if (added === 0) {
    console.log(`[OK] ${name}: all Plutio mounts already present`);
    continue;
  }

  setRegisteredGroup(jid, {
    ...current,
    containerConfig: {
      ...current.containerConfig,
      additionalMounts: newMounts,
    },
  });

  console.log(`[UPDATED] ${name}: ${added} mount(s) added (total: ${newMounts.length})`);
}

console.log('\nDone. Restart NanoClaw to apply: launchctl kickstart -k gui/$(id -u)/com.nanoclaw');
