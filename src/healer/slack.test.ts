import { describe, it, expect, vi, beforeEach } from 'vitest';

const { readEnvFile } = vi.hoisted(() => ({ readEnvFile: vi.fn(() => ({})) }));
const { postMessage } = vi.hoisted(() => ({ postMessage: vi.fn() }));
vi.mock('../env.js', () => ({ readEnvFile }));
vi.mock('@slack/web-api', () => ({
  // regular function (not arrow) so it's constructable via `new WebClient()`
  WebClient: vi.fn(function () {
    return { chat: { postMessage } };
  }),
}));
vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { postIncidents } from './slack.js';

describe('postIncidents', () => {
  beforeEach(() => postMessage.mockReset());

  it('returns false when SLACK_BOT_TOKEN is missing', async () => {
    readEnvFile.mockReturnValue({});
    expect(await postIncidents('hi')).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts to the incidents channel and returns true when token is present', async () => {
    readEnvFile.mockReturnValue({ SLACK_BOT_TOKEN: 'xoxb-test' });
    postMessage.mockResolvedValue({ ok: true });
    expect(await postIncidents('hello')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello' }),
    );
  });

  it('returns false (no throw) when Slack rejects', async () => {
    readEnvFile.mockReturnValue({ SLACK_BOT_TOKEN: 'xoxb-test' });
    postMessage.mockRejectedValueOnce(new Error('channel_not_found'));
    expect(await postIncidents('x')).toBe(false);
  });
});
