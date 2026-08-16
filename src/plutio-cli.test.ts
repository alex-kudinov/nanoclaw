import { beforeEach, describe, expect, it, vi } from 'vitest';

const exec = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({ execFile: exec }));
vi.mock('./env.js', () => ({ readEnvFile: vi.fn(() => ({})) }));

import { callPlutioTool, stripToJson } from './plutio-cli.js';

beforeEach(() => {
  delete process.env.EXTERNAL_WRITE_SAFE_MODE;
  exec.mockReset();
  exec.mockImplementation(
    (
      _file: string,
      _args: string[],
      _options: unknown,
      callback: (
        error: null,
        result: { stdout: string; stderr: string },
      ) => void,
    ) => callback(null, { stdout: 'OK []', stderr: '' }),
  );
});

describe('Plutio external-write brake', () => {
  it('keeps reads available while denying writes before tool invocation', async () => {
    process.env.EXTERNAL_WRITE_SAFE_MODE = '1';
    await expect(callPlutioTool('list-proposals.sh', [])).resolves.toBe(
      'OK []',
    );
    expect(exec).toHaveBeenCalledTimes(1);

    await expect(
      callPlutioTool('create-proposal.sh', ['--data', '{}']),
    ).rejects.toMatchObject({
      name: 'ExternalWriteDeniedError',
      code: 'global_safe_mode',
    });
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe('stripToJson', () => {
  it('strips the OK status prefix before an object', () => {
    expect(stripToJson('OK {"_id":"x","status":"declined"}')).toBe(
      '{"_id":"x","status":"declined"}',
    );
  });

  it('strips the OK status prefix before an array', () => {
    expect(stripToJson('OK [{"_id":"x"}]')).toBe('[{"_id":"x"}]');
  });

  it('passes through bare JSON unchanged', () => {
    expect(stripToJson('{"a":1}')).toBe('{"a":1}');
  });

  it('trims surrounding whitespace', () => {
    expect(stripToJson('  OK {"a":1}\n')).toBe('{"a":1}');
  });

  it('returns empty string for an ERR line with no JSON', () => {
    expect(stripToJson('ERR upstream 500')).toBe('');
  });

  it('round-trips through JSON.parse for prefixed output', () => {
    const obj = JSON.parse(stripToJson('OK {"_id":"abc","status":"declined"}'));
    expect(obj).toEqual({ _id: 'abc', status: 'declined' });
  });
});
