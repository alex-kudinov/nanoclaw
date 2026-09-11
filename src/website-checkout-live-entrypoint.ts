import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseWebsiteCheckoutLivePrivateConfig,
  startWebsiteCheckoutLiveService,
} from './website-checkout-live-runner.js';
import { verifyRuntimeRelease } from './release-integrity.js';

export const WEBSITE_CHECKOUT_LIVE_USAGE =
  'usage: website-checkout-live (--config|--check-config) ABSOLUTE_PATH';

export function parseWebsiteCheckoutLiveArguments(
  argv: readonly string[],
): { kind: 'help' } | { kind: 'start' | 'check'; configPath: string } {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0]))
    return { kind: 'help' };
  if (
    argv.length !== 2 ||
    !['--config', '--check-config'].includes(argv[0]) ||
    !argv[1] ||
    !isAbsolute(argv[1])
  )
    throw new Error(WEBSITE_CHECKOUT_LIVE_USAGE);
  return {
    kind: argv[0] === '--config' ? 'start' : 'check',
    configPath: argv[1],
  };
}

export async function runWebsiteCheckoutLiveEntrypoint(
  argv: readonly string[],
  dependencies: {
    start?: typeof startWebsiteCheckoutLiveService;
    validate?: typeof parseWebsiteCheckoutLivePrivateConfig;
    verifyRelease?: typeof verifyRuntimeRelease;
    stdout?: Pick<NodeJS.WriteStream, 'write'>;
    stderr?: Pick<NodeJS.WriteStream, 'write'>;
    installSignalHandlers?: boolean;
  } = {},
): Promise<number> {
  const stdout = dependencies.stdout ?? process.stdout;
  const stderr = dependencies.stderr ?? process.stderr;
  let parsed: ReturnType<typeof parseWebsiteCheckoutLiveArguments>;
  try {
    parsed = parseWebsiteCheckoutLiveArguments(argv);
  } catch {
    stderr.write(`ERROR website-checkout-live code=invalid_arguments\n`);
    return 1;
  }
  if (parsed.kind === 'help') {
    stdout.write(`${WEBSITE_CHECKOUT_LIVE_USAGE}\n`);
    return 0;
  }
  try {
    (dependencies.verifyRelease ?? verifyRuntimeRelease)();
  } catch {
    stderr.write('ERROR website-checkout-live code=release_integrity_failed\n');
    return 1;
  }
  if (parsed.kind === 'check') {
    try {
      (dependencies.validate ?? parseWebsiteCheckoutLivePrivateConfig)(
        parsed.configPath,
      );
      stdout.write('VALID website-checkout-live config=accepted\n');
      return 0;
    } catch {
      stderr.write('ERROR website-checkout-live code=invalid_config\n');
      return 1;
    }
  }
  try {
    const runtime = await (
      dependencies.start ?? startWebsiteCheckoutLiveService
    )(parsed.configPath);
    stdout.write(
      `READY website-checkout-live host=${runtime.host} port=${runtime.port}\n`,
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
    stderr.write(`ERROR website-checkout-live code=startup_failed\n`);
    return 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = await runWebsiteCheckoutLiveEntrypoint(
    process.argv.slice(2),
  );
}
