import { expect, it } from 'vitest';

import { runInstalledActionSafetyBoundaryDrill } from './action-safety-boundary-drill.js';

it('denies every installed guarded boundary without crossing a side-effect tripwire', async () => {
  const originalCwd = process.cwd();
  const result = await runInstalledActionSafetyBoundaryDrill();

  expect(process.cwd()).toBe(originalCwd);
  expect(result.config).toEqual({
    enforcementEnabled: false,
    globalSafeMode: true,
    disabledSystems: [],
    valid: true,
  });
  expect(result.denials).toEqual([
    { system: 'gmail', code: 'global_safe_mode' },
    { system: 'gmail', code: 'global_safe_mode' },
    { system: 'slack', code: 'global_safe_mode' },
    { system: 'courses_smtp', code: 'global_safe_mode' },
    { system: 'plutio', code: 'global_safe_mode' },
    { system: 'stripe', code: 'global_safe_mode' },
    { system: 'hive_firestore', code: 'global_safe_mode' },
    { system: 'things', code: 'global_safe_mode' },
  ]);
  expect(result.tripwires).toEqual({
    gmailClient: false,
    gmailReplySend: false,
    plutioChild: false,
    stripeChild: false,
    stripeLifecycleEnqueue: false,
    hiveFirestore: false,
    thingsBridge: false,
  });
  expect(result.slackOutgoingQueueDepth).toBe(0);
  expect(result.courses).toEqual({
    smtpAllowed: false,
    projectedSecretKeys: [],
    emailToolMounted: false,
  });
});
