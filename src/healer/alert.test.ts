import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { alert } from './alert.js';

// Tests run against real binaries (no child_process mock): /bin/echo for the
// success path, a missing path for the swallow path.
afterEach(() => {
  delete process.env.HEALER_ALERT_SH;
});

describe('alert', () => {
  it('resolves when the alert script exits 0', async () => {
    process.env.HEALER_ALERT_SH = '/bin/echo';
    await expect(alert('info', 's', 'm')).resolves.toBeUndefined();
  });

  it('swallows a missing/erroring alert script (never throws)', async () => {
    process.env.HEALER_ALERT_SH = '/nonexistent/path/alert.sh';
    await expect(alert('warn', 's', 'm')).resolves.toBeUndefined();
  });
});
