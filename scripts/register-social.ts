/**
 * register-social.ts — register the social minion in NanoClaw
 *
 * Inserts/updates registered_groups for the social group.
 * Mounts the linkedin toolbox + toolbox lib + vault LinkedIn folder.
 *
 * After running this you must ALSO update ~/.config/nanoclaw/mount-allowlist.json
 * on Mac Mini (the script prints the required JSON entries).
 *
 * Usage: GRU_SOCIAL_CHANNEL_ID=C0... npx tsx scripts/register-social.ts
 */
import { initDatabase, getRegisteredGroup, setRegisteredGroup } from '../src/db.js';

const SLACK_CHANNEL_ID = process.env.GRU_SOCIAL_CHANNEL_ID || 'CHANGE_ME';
const SLACK_JID = `slack:${SLACK_CHANNEL_ID}`;

if (SLACK_CHANNEL_ID === 'CHANGE_ME') {
  console.error('ERROR: GRU_SOCIAL_CHANNEL_ID env var required');
  console.error('Create #gru-social channel first, then re-run with the channel ID');
  process.exit(1);
}

const SOCIAL_MOUNTS = [
  { hostPath: '~/dev/toolbox/shared/linkedin', containerPath: 'linkedin', readonly: true },
  { hostPath: '~/dev/toolbox/lib', containerPath: 'toolbox-lib', readonly: true },
  { hostPath: '~/Vaults/My Notes/LinkedIn', containerPath: 'vault-linkedin', readonly: false },
  { hostPath: '~/dev/tandemweb/blog', containerPath: 'tandemweb-blog', readonly: true },
  {
    hostPath: '~/dev/tandemweb/data/voice/alex/output/skills/alex-voice',
    containerPath: 'alex-voice',
    readonly: true,
  },
];

initDatabase();

const existing = getRegisteredGroup(SLACK_JID);

const containerConfig = {
  additionalMounts: SOCIAL_MOUNTS,
};

setRegisteredGroup(SLACK_JID, {
  name: 'Gru Social (LinkedIn posting)',
  folder: 'social',
  trigger: '.*',
  added_at: existing?.added_at || new Date().toISOString(),
  containerConfig,
  requiresTrigger: false,
  isMain: false,
});

console.log(existing ? 'Updated existing social group' : 'Inserted new social group');
console.log(`JID: ${SLACK_JID}`);
console.log(`Mounts: ${SOCIAL_MOUNTS.length}`);

console.log('\n=== Mount allowlist entries needed in ~/.config/nanoclaw/mount-allowlist.json ===');
const allowlistEntries = SOCIAL_MOUNTS.map((m) => ({
  path: m.hostPath,
  allowReadWrite: !m.readonly,
  description: `social minion: ${m.containerPath}`,
}));
console.log(JSON.stringify(allowlistEntries, null, 2));
