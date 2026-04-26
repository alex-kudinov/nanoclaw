/**
 * Register the Booking Coordinator group in NanoClaw.
 * Run on Mac Mini after creating the #gru-booking Slack channel.
 *
 * Usage: npx tsx scripts/register-booking.ts <slack_channel_id>
 * Example: npx tsx scripts/register-booking.ts C0XXXXXXXXX
 */
import { initDatabase, setRegisteredGroup } from '../src/db.js';

const channelId = process.argv[2];
if (!channelId) {
  console.error('Usage: npx tsx scripts/register-booking.ts <slack_channel_id>');
  console.error('Example: npx tsx scripts/register-booking.ts C0XXXXXXXXX');
  process.exit(1);
}

const jid = `slack:${channelId}`;

initDatabase();

setRegisteredGroup(jid, {
  name: 'gru-booking',
  folder: 'booking',
  trigger: '',
  added_at: new Date().toISOString(),
  requiresTrigger: false,
  containerConfig: {
    additionalMounts: [
      {
        hostPath: 'knowledge/agents/booking',
        containerPath: 'knowledge',
        readonly: true,
      },
      {
        hostPath: '~/dev/toolbox/shared/plutio',
        containerPath: 'plutio',
        readonly: true,
      },
      {
        hostPath: '~/dev/toolbox/lib',
        containerPath: 'toolbox-lib',
        readonly: true,
      },
      {
        hostPath: 'agent_docs',
        containerPath: 'agent_docs',
        readonly: true,
      },
    ],
  },
});

console.log(`Registered booking group: ${jid} → groups/booking/`);
