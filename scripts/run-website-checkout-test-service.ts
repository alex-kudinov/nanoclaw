import {
  cleanupWebsiteCheckoutTestService,
  startWebsiteCheckoutTestService,
  switchWebsiteCheckoutTestAttributionProfile,
  switchWebsiteCheckoutTestProfile,
} from '../src/website-checkout-test-runner.js';

type Arguments =
  | { configPath: string; mode: 'serve' | 'cleanup' }
  | {
      configPath: string;
      mode: 'switch_profile';
      from: 'protected_preview' | 'public_anonymous';
      to: 'protected_preview' | 'public_anonymous';
    }
  | {
      configPath: string;
      mode: 'switch_attribution';
      from: 'legacy_v1' | 'english_mcs_card_v2';
      to: 'legacy_v1' | 'english_mcs_card_v2';
    };

function argumentsFor(argv: readonly string[]): Arguments {
  if (
    argv.length === 5 &&
    argv[0] === '--switch-attribution-profile' &&
    ['legacy_v1', 'english_mcs_card_v2'].includes(argv[1]) &&
    ['legacy_v1', 'english_mcs_card_v2'].includes(argv[2]) &&
    argv[3] === '--config' &&
    argv[4]
  )
    return {
      mode: 'switch_attribution',
      from: argv[1] as 'legacy_v1' | 'english_mcs_card_v2',
      to: argv[2] as 'legacy_v1' | 'english_mcs_card_v2',
      configPath: argv[4],
    };
  if (
    argv.length === 5 &&
    argv[0] === '--switch-profile' &&
    ['protected_preview', 'public_anonymous'].includes(argv[1]) &&
    ['protected_preview', 'public_anonymous'].includes(argv[2]) &&
    argv[3] === '--config' &&
    argv[4]
  )
    return {
      mode: 'switch_profile',
      from: argv[1] as 'protected_preview' | 'public_anonymous',
      to: argv[2] as 'protected_preview' | 'public_anonymous',
      configPath: argv[4],
    };
  const cleanup = argv[0] === '--cleanup';
  const offset = cleanup ? 1 : 0;
  if (
    argv.length !== offset + 2 ||
    argv[offset] !== '--config' ||
    !argv[offset + 1]
  )
    throw new Error(
      'usage: run-website-checkout-test-service [--cleanup | --switch-profile FROM TO | --switch-attribution-profile FROM TO] --config ABSOLUTE_PATH',
    );
  return { configPath: argv[offset + 1], mode: cleanup ? 'cleanup' : 'serve' };
}

async function main(): Promise<void> {
  const args = argumentsFor(process.argv.slice(2));
  if (args.mode === 'switch_attribution') {
    const switched = switchWebsiteCheckoutTestAttributionProfile(
      args.configPath,
      args.from,
      args.to,
    );
    process.stdout.write(
      `SWITCHED website-checkout-test attribution=${switched.from}->${switched.to} database=${switched.database}\n`,
    );
    return;
  }
  if (args.mode === 'switch_profile') {
    const switched = switchWebsiteCheckoutTestProfile(
      args.configPath,
      args.from,
      args.to,
    );
    process.stdout.write(
      `SWITCHED website-checkout-test profile=${switched.from}->${switched.to} database=${switched.database}\n`,
    );
    return;
  }
  if (args.mode === 'cleanup') {
    const cleaned = await cleanupWebsiteCheckoutTestService(args.configPath);
    process.stdout.write(
      `CLEANED website-checkout-test database=${cleaned.database}\n`,
    );
    return;
  }
  const runtime = await startWebsiteCheckoutTestService({
    configPath: args.configPath,
  });
  process.stdout.write(
    `READY website-checkout-test host=127.0.0.1 port=${runtime.port} database=${runtime.database}\n`,
  );

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await runtime.stop();
    process.exitCode = 0;
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

await main().catch(() => {
  process.stderr.write('ERROR website-checkout-test code=startup_failed\n');
  process.exitCode = 1;
});
