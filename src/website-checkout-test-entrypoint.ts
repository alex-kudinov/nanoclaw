import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import { verifyRuntimeRelease } from './release-integrity.js';
import { startWebsiteCheckoutTestService } from './website-checkout-test-runner.js';

export const WEBSITE_CHECKOUT_TEST_USAGE =
  'usage: website-checkout-test --config ABSOLUTE_PATH';

export function parseWebsiteCheckoutTestArguments(
  argv: readonly string[],
): { kind: 'help' } | { kind: 'start'; configPath: string } {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0]))
    return { kind: 'help' };
  if (
    argv.length !== 2 ||
    argv[0] !== '--config' ||
    !argv[1] ||
    !isAbsolute(argv[1])
  )
    throw new Error(WEBSITE_CHECKOUT_TEST_USAGE);
  return { kind: 'start', configPath: argv[1] };
}

export async function runWebsiteCheckoutTestEntrypoint(
  argv: readonly string[],
  dependencies: {
    start?: typeof startWebsiteCheckoutTestService;
    verifyRelease?: typeof verifyRuntimeRelease;
    stdout?: Pick<NodeJS.WriteStream, 'write'>;
    stderr?: Pick<NodeJS.WriteStream, 'write'>;
    installSignalHandlers?: boolean;
  } = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  let parsed: ReturnType<typeof parseWebsiteCheckoutTestArguments>;
  try {
    parsed = parseWebsiteCheckoutTestArguments(argv);
  } catch {
    stderr.write('ERROR website-checkout-test code=invalid_arguments\n');
    return 1;
  }
  if (parsed.kind === 'help') {
    stdout.write(`${WEBSITE_CHECKOUT_TEST_USAGE}\n`);
    return 0;
  }
  try {
    (dependencies.verifyRelease ?? verifyRuntimeRelease)();
  } catch {
    stderr.write('ERROR website-checkout-test code=release_integrity_failed\n');
    return 1;
  }
  try {
    const runtime = await (
      dependencies.start ?? startWebsiteCheckoutTestService
    )({ configPath: parsed.configPath });
    stdout.write(
      `READY website-checkout-test host=127.0.0.1 port=${runtime.port}\n`,
    );
    if (dependencies.installSignalHandlers !== false) {
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
    return 0;
  } catch {
    stderr.write('ERROR website-checkout-test code=startup_failed\n');
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await runWebsiteCheckoutTestEntrypoint(
    process.argv.slice(2),
  );
}
