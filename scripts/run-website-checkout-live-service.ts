import { startWebsiteCheckoutLiveService } from '../src/website-checkout-live-runner.js';

function configPath(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== '--config' || !argv[1])
    throw new Error(
      'usage: run-website-checkout-live-service --config ABSOLUTE_PATH',
    );
  return argv[1];
}

async function main(): Promise<void> {
  const runtime = await startWebsiteCheckoutLiveService(
    configPath(process.argv.slice(2)),
  );
  process.stdout.write(
    `READY website-checkout-live host=${runtime.host} port=${runtime.port}\n`,
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
  process.stderr.write('ERROR website-checkout-live code=startup_failed\n');
  process.exitCode = 1;
});
