import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  ExternalWriteDeniedError,
  loadActionSafetyConfig,
  type ActionSystem,
} from './action-safety.js';

const ENV_KEYS = [
  'NANOCLAW_CODE_ROOT',
  'TOOLBOX_DIR',
  'ACTION_SAFETY_ENFORCEMENT_ENABLED',
  'EXTERNAL_WRITE_SAFE_MODE',
  'EXTERNAL_WRITE_DISABLED_SYSTEMS',
] as const;

export interface ActionSafetyBoundaryDrillResult {
  config: {
    enforcementEnabled: boolean;
    globalSafeMode: boolean;
    disabledSystems: ActionSystem[];
    valid: boolean;
  };
  denials: Array<{ system: ActionSystem; code: 'global_safe_mode' }>;
  tripwires: {
    gmailClient: boolean;
    gmailReplySend: boolean;
    plutioChild: boolean;
    stripeChild: boolean;
    stripeLifecycleEnqueue: boolean;
    hiveFirestore: boolean;
  };
  slackOutgoingQueueDepth: number;
  courses: {
    smtpAllowed: boolean;
    projectedSecretKeys: string[];
    emailToolMounted: boolean;
  };
}

class BoundaryTripwireError extends Error {
  constructor(boundary: string) {
    super(`action-safety drill crossed ${boundary} tripwire`);
    this.name = 'BoundaryTripwireError';
  }
}

function saveEnvironment(): Map<string, string | undefined> {
  return new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnvironment(saved: Map<string, string | undefined>): void {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function expectGlobalDenial(
  system: ActionSystem,
  operation: () => Promise<unknown> | unknown,
): Promise<{ system: ActionSystem; code: 'global_safe_mode' }> {
  try {
    await operation();
  } catch (error) {
    if (
      error instanceof ExternalWriteDeniedError &&
      error.system === system &&
      error.code === 'global_safe_mode'
    ) {
      return { system, code: 'global_safe_mode' };
    }
    throw error;
  }
  throw new Error(`action-safety drill unexpectedly allowed ${system}`);
}

/**
 * Exercise each installed external-write boundary with synthetic inputs.
 *
 * The drill changes into an isolated directory containing fake credentials
 * before importing boundary modules. Gmail, Plutio, and Stripe also receive
 * tripwire dependencies that throw if execution passes their host guard.
 * Slack remains disconnected, so a missed guard could only enqueue locally;
 * the queue is checked and discarded with the short-lived process.
 */
export async function runInstalledActionSafetyBoundaryDrill(): Promise<ActionSafetyBoundaryDrillResult> {
  const previousCwd = process.cwd();
  const savedEnvironment = saveEnvironment();
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'nanoclaw-action-safety-drill-'),
  );
  const tripwires = {
    gmailClient: false,
    gmailReplySend: false,
    plutioChild: false,
    stripeChild: false,
    stripeLifecycleEnqueue: false,
    hiveFirestore: false,
  };

  try {
    fs.writeFileSync(
      path.join(root, '.env'),
      [
        'ACTION_SAFETY_ENFORCEMENT_ENABLED=0',
        'EXTERNAL_WRITE_SAFE_MODE=1',
        'EXTERNAL_WRITE_DISABLED_SYSTEMS=',
        'GMAIL_CLIENT_ID=action-safety-drill',
        'GMAIL_CLIENT_SECRET=action-safety-drill',
        'GMAIL_REFRESH_TOKEN=action-safety-drill',
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
    for (const key of [
      'ACTION_SAFETY_ENFORCEMENT_ENABLED',
      'EXTERNAL_WRITE_SAFE_MODE',
      'EXTERNAL_WRITE_DISABLED_SYSTEMS',
    ] as const) {
      delete process.env[key];
    }
    process.env.NANOCLAW_CODE_ROOT = path.join(root, 'nonexistent-code-root');
    process.env.TOOLBOX_DIR = path.join(root, 'nonexistent-toolbox');
    process.chdir(root);

    const config = loadActionSafetyConfig();
    if (
      !config.valid ||
      config.enforcementEnabled ||
      !config.globalSafeMode ||
      config.disabledSystems.length !== 0
    ) {
      throw new Error(
        'action-safety drill did not load the isolated global brake',
      );
    }

    const [gmailApi, { SlackChannel }, containerRunner, plutio, stripe, hive] =
      await Promise.all([
        import('./gmail-api.js'),
        import('./channels/slack.js'),
        import('./container-runner.js'),
        import('./plutio-cli.js'),
        import('./stripe-payment-host.js'),
        import('./hive-bridge.js'),
      ]);

    const denials: ActionSafetyBoundaryDrillResult['denials'] = [];
    denials.push(
      await expectGlobalDenial('gmail', () =>
        gmailApi.sendEmail(
          {
            to: 'action-safety-drill@example.invalid',
            subject: 'Synthetic action-safety drill',
            body: 'This synthetic message must never cross the Gmail boundary.',
          },
          {
            getClient: () => {
              tripwires.gmailClient = true;
              throw new BoundaryTripwireError('Gmail client');
            },
          },
        ),
      ),
    );
    denials.push(
      await expectGlobalDenial('gmail', () =>
        gmailApi.replyToThread(
          {
            threadId: 'thread_action_safety_drill',
            body: 'This synthetic reply must never cross the Gmail boundary.',
          },
          {
            getClient: () =>
              ({
                users: {
                  threads: {
                    get: async () => ({
                      data: {
                        messages: [
                          {
                            payload: {
                              headers: [
                                {
                                  name: 'From',
                                  value:
                                    'Synthetic External <action-safety-drill@example.invalid>',
                                },
                                {
                                  name: 'To',
                                  value: 'info@tandemcoach.co',
                                },
                                {
                                  name: 'Subject',
                                  value: 'Synthetic action-safety thread',
                                },
                                {
                                  name: 'Message-ID',
                                  value:
                                    '<action-safety-drill@example.invalid>',
                                },
                              ],
                            },
                          },
                        ],
                      },
                    }),
                  },
                  messages: {
                    send: async () => {
                      tripwires.gmailReplySend = true;
                      throw new BoundaryTripwireError('Gmail reply send');
                    },
                  },
                },
              }) as never,
          },
        ),
      ),
    );

    // Deliberately bypass the SDK-owning constructor. @slack/bolt may start an
    // asynchronous auth.test from App construction even when start/connect is
    // never called. The send method itself needs only these local fields before
    // its disconnected-queue branch, so this still exercises the installed
    // mutation boundary and turns a missed guard into a local queue failure.
    const slack = Object.create(SlackChannel.prototype) as InstanceType<
      typeof SlackChannel
    >;
    Object.assign(slack as unknown as Record<string, unknown>, {
      connected: false,
      outgoingQueue: [],
      outgoingRetryAttempt: 0,
      leadResolverDowngradeCount: 0,
      lastLeadResolverDowngradeAt: null,
    });
    denials.push(
      await expectGlobalDenial('slack', () =>
        slack.sendMessage(
          'slack:C_ACTION_SAFETY_DRILL',
          'Synthetic action-safety drill; this must never be queued or sent.',
        ),
      ),
    );
    const slackOutgoingQueueDepth = Number(
      slack.getDiagnostics().outgoingQueueDepth,
    );
    if (slackOutgoingQueueDepth !== 0) {
      throw new Error('Slack denial left a queued outbound message');
    }

    const configuredSecrets = {
      EMAIL_USER: 'synthetic-user',
      EMAIL_PASS: 'synthetic-password',
    };
    const smtpAllowed = containerRunner.coursesSmtpCapabilityAllowed('courses');
    const projectedSecrets = containerRunner.projectCoursesSmtpSecrets(
      'courses',
      configuredSecrets,
    );
    const mounts = containerRunner.filterExternalWriteMounts('courses', [
      {
        hostPath: path.join(root, 'synthetic-email-tool'),
        containerPath: 'email',
        readonly: true,
      },
      {
        hostPath: path.join(root, 'synthetic-instructors'),
        containerPath: 'instructors',
        readonly: true,
      },
    ]);
    const projectedSecretKeys = Object.keys(projectedSecrets).sort();
    const emailToolMounted = mounts.some(
      (mount) =>
        (mount.containerPath || path.basename(mount.hostPath)) === 'email',
    );
    if (smtpAllowed || projectedSecretKeys.length > 0 || emailToolMounted) {
      throw new Error(
        'Courses SMTP denial left a credential or tool projection',
      );
    }
    denials.push({ system: 'courses_smtp', code: 'global_safe_mode' });

    denials.push(
      await expectGlobalDenial('plutio', () =>
        plutio.callPlutioTool('create-proposal.sh', [], 1_000, {
          execFile: async () => {
            tripwires.plutioChild = true;
            throw new BoundaryTripwireError('Plutio child process');
          },
        }),
      ),
    );

    denials.push(
      await expectGlobalDenial('stripe', () =>
        stripe.handleStripePayment(
          {
            stripe_id: 'pi_action_safety_drill',
            event_type: 'payment_intent.succeeded',
            account: 'tandem',
          },
          {
            execFile: async () => {
              tripwires.stripeChild = true;
              throw new BoundaryTripwireError('Stripe child process');
            },
            enqueueLifecycleFact: async () => {
              tripwires.stripeLifecycleEnqueue = true;
              throw new BoundaryTripwireError('Stripe lifecycle outbox');
            },
          },
        ),
      ),
    );

    denials.push(
      await expectGlobalDenial('hive_firestore', () =>
        hive.assignConversation(
          'thread_action_safety_drill',
          'uid_action_safety_drill',
          {
            getFirestore: () => {
              tripwires.hiveFirestore = true;
              throw new BoundaryTripwireError('Hive Firestore client');
            },
          },
        ),
      ),
    );

    if (Object.values(tripwires).some(Boolean)) {
      throw new Error('an external-write tripwire was crossed');
    }
    return {
      config: {
        enforcementEnabled: config.enforcementEnabled,
        globalSafeMode: config.globalSafeMode,
        disabledSystems: [...config.disabledSystems],
        valid: config.valid,
      },
      denials,
      tripwires,
      slackOutgoingQueueDepth,
      courses: {
        smtpAllowed,
        projectedSecretKeys,
        emailToolMounted,
      },
    };
  } finally {
    process.chdir(previousCwd);
    restoreEnvironment(savedEnvironment);
    fs.rmSync(root, { recursive: true, force: true });
  }
}
