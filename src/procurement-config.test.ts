import fs from 'fs';
import { describe, expect, it } from 'vitest';

const service = fs.readFileSync(
  new URL('../setup/service.ts', import.meta.url),
  'utf8',
);
const plist = fs.readFileSync(
  new URL('../setup/launchd/com.nanoclaw.plist', import.meta.url),
  'utf8',
);
const envExample = fs.readFileSync(
  new URL('../.env.example', import.meta.url),
  'utf8',
);
const indexSource = fs.readFileSync(
  new URL('./index.ts', import.meta.url),
  'utf8',
);

describe('Procurement release-bound configuration', () => {
  const keys = [
    'PROCUREMENT_CALEPROCURE_INGEST_ENABLED',
    'PROCUREMENT_REVIEW_ENABLED',
    'PROCUREMENT_REVIEW_EPOCH',
    'PROCUREMENT_OPERATOR_UIDS',
  ];

  it('puts every gate in both launchd sources', () => {
    for (const key of keys) {
      expect(service).toContain(`<key>${key}</key>`);
      expect(plist).toContain(`<key>${key}</key>`);
    }
  });

  it('does not document an inert env-file configuration surface', () => {
    for (const key of keys) expect(envExample).not.toContain(key);
  });

  it('uses receipt-returning host Slack posts that remain bot-noise guarded', () => {
    expect(indexSource).toContain('const messageTs = await slack.postTracked(');
    expect(indexSource).toContain('channelJid ?? entry![0]');
    expect(indexSource).not.toContain(
      'await slack.sendMessage(entry[0], text);',
    );
  });
});
