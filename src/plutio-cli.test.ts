import { describe, it, expect } from 'vitest';

import { stripToJson } from './plutio-cli.js';

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
