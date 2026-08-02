/**
 * Register the MCS Grader minion in NanoClaw.
 * Run on the Mac Mini after creating the #gru-grader Slack channel.
 *
 * Usage: npx tsx scripts/register-grader.ts <slack_channel_id>
 * Example: npx tsx scripts/register-grader.ts C0BFBFNPN6M
 *
 * MODEL-PER-ACTION POLICY (data-backed, 2026-07-05 eval):
 *   - Routine grading + resubmittals (this minion): SONNET 5. In a 2-case eval,
 *     Sonnet caught a hard word-floor violation that Haiku missed (Haiku wrongly
 *     PASSed) and matched Opus on every verdict + the subtle 67%-aggregate
 *     calibration. Async Slack, so Sonnet's latency is a non-issue. Never Haiku
 *     for grading - it produced a student-visible wrong PASS.
 *   - Calibrating a NEW assignment + onboarding a new course: OPUS, done in Claude
 *     Code (rare, precedent-setting, human-in-the-loop). NanoClaw is one-model-per-
 *     minion, so the Opus tier lives outside this minion by design.
 *   - To bump this minion to Opus for max feedback polish (~5x cost, slower):
 *     change model below to 'opus'. One value.
 */
import { initDatabase, setRegisteredGroup } from '../src/db.js';

const channelId = process.argv[2];
if (!channelId) {
  console.error('Usage: npx tsx scripts/register-grader.ts <slack_channel_id>');
  console.error('Example: npx tsx scripts/register-grader.ts C0BFBFNPN6M');
  process.exit(1);
}

const jid = `slack:${channelId}`;

initDatabase();

setRegisteredGroup(jid, {
  name: 'gru-grader',
  folder: 'grader',
  trigger: '',
  added_at: new Date().toISOString(),
  requiresTrigger: false, // dedicated channel - every message reaches the grader
  containerConfig: {
    timeout: 600000,
    model: 'sonnet', // see MODEL-PER-ACTION POLICY above
    processingMessage: 'Grading submission',
    // Each Slack root is an independent submission with its own concurrent
    // container/session. Five posted roots can therefore use the host's five
    // slots instead of serializing behind one channel-level conversation.
    threadPerMessage: true,
    // Grader threads are one-shot work units. Release warm capacity quickly;
    // conversational groups keep the longer global idle window.
    idleTimeout: 30000,
    additionalMounts: [
      {
        // The standalone, self-contained grading platform (registry + graders +
        // calibration + assignment/rubric SNAPSHOTS + per-student records). Small
        // (~2 MB) and synced to the mini like any ~/dev folder, so students/ records
        // the minion writes sync back to the workstations. NOT tied to the courses
        // repo (which is excluded from the mini) - onboarding already snapshotted
        // everything grade-time-relevant into this pack.
        hostPath: '~/dev/grading',
        containerPath: 'grading',
        readonly: false,
      },
      {
        // Per-agent learned-lessons dir (matches the courses minion pattern).
        hostPath: 'knowledge/agents/grader',
        containerPath: 'knowledge',
        readonly: false,
      },
    ],
  },
});

console.log(
  `Registered grader group: ${jid} → groups/grader/  (model: sonnet)`,
);
