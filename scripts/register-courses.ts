/**
 * Register the Course Session Coordinator group in NanoClaw.
 * Run on Mac Mini after creating the #gru-courses Slack channel.
 *
 * Usage: npx tsx scripts/register-courses.ts <slack_channel_id>
 * Example: npx tsx scripts/register-courses.ts C0AR3K7QU85
 */
import { initDatabase, setRegisteredGroup } from '../src/db.js';

const channelId = process.argv[2];
if (!channelId) {
  console.error('Usage: npx tsx scripts/register-courses.ts <slack_channel_id>');
  console.error('Example: npx tsx scripts/register-courses.ts C0AR3K7QU85');
  process.exit(1);
}

const jid = `slack:${channelId}`;

initDatabase();

setRegisteredGroup(jid, {
  name: 'gru-courses',
  folder: 'courses',
  trigger: '',
  added_at: new Date().toISOString(),
  requiresTrigger: false,
  containerConfig: {
    timeout: 600000,
    additionalMounts: [
      {
        hostPath: '~/Vaults/My Notes/Tandem/Enrichment',
        containerPath: 'enrichment',
        readonly: false,
      },
      {
        hostPath: '~/Vaults/My Notes/Tandem/Meetings',
        containerPath: 'meetings',
        readonly: true,
      },
      {
        hostPath: '~/dev/NanoClaw/tools/enricher',
        containerPath: 'enricher',
        readonly: true,
      },
      {
        hostPath: '~/dev/tandemweb/data/instructors',
        containerPath: 'instructors',
        readonly: true,
      },
      {
        hostPath: '~/dev/toolbox/shared/email/tools/email',
        containerPath: 'email',
        readonly: true,
      },
      {
        hostPath: '~/dev/toolbox/lib',
        containerPath: 'toolbox-lib',
        readonly: true,
      },
      {
        hostPath: 'knowledge/agents/courses',
        containerPath: 'knowledge',
        readonly: false,
      },
    ],
  },
});

console.log(`Registered courses group: ${jid} → groups/courses/`);
