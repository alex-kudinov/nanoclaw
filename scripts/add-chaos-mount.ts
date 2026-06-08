/**
 * Mount the Chaos visitor-journey toolbox into the sales container.
 * Preserves existing mounts (read-modify-write pattern).
 *
 * Requires `~/dev/toolbox/shared/chaos` in the external mount allowlist
 * (`~/.config/nanoclaw/mount-allowlist.json`).
 *
 * Usage: npx tsx scripts/add-chaos-mount.ts
 */
import {
  initDatabase,
  getRegisteredGroup,
  setRegisteredGroup,
} from '../src/db.js';

const CHAOS_MOUNT = {
  hostPath: '~/dev/toolbox/shared/chaos',
  containerPath: 'chaos',
  readonly: true,
};

const TARGETS: Record<string, string> = {
  sales: 'slack:C0AHV1SGT6W',
};

initDatabase();

for (const [name, jid] of Object.entries(TARGETS)) {
  const current = getRegisteredGroup(jid);
  if (!current) {
    console.error(`[SKIP] ${name} (${jid}) not found in registered_groups`);
    continue;
  }
  const existing = current.containerConfig?.additionalMounts ?? [];
  if (
    existing.some(
      (m: { containerPath?: string }) => m.containerPath === 'chaos',
    )
  ) {
    console.log(`[OK] ${name}: chaos mount already present`);
    continue;
  }
  setRegisteredGroup(jid, {
    ...current,
    containerConfig: {
      ...current.containerConfig,
      additionalMounts: [...existing, CHAOS_MOUNT],
    },
  });
  console.log(`[UPDATED] ${name}: chaos mount added`);
}

console.log(
  '\nDone. Restart NanoClaw to apply: launchctl kickstart -k gui/$(id -u)/com.nanoclaw',
);
