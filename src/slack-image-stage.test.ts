import fs from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  detectSupportedRasterFormat,
  MAX_SLACK_IMAGE_BYTES,
  SLACK_IMAGE_RETENTION_MS,
  stageSlackImage,
} from './slack-image-stage.js';

const tempRoots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nanoclaw-slack-image-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('Slack image staging', () => {
  it.each([
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'],
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'jpg'],
    [Buffer.from('GIF89a'), 'gif'],
    [Buffer.from('RIFF0000WEBP'), 'webp'],
  ] as const)('recognizes supported raster bytes', (bytes, expected) => {
    expect(detectSupportedRasterFormat(bytes)).toBe(expected);
  });

  it('rejects an image filename whose bytes are not a supported raster', () => {
    expect(detectSupportedRasterFormat(Buffer.from('<svg>prompt</svg>'))).toBe(
      null,
    );
  });

  it('atomically stages private bytes under opaque message and file paths', async () => {
    const root = await tempRoot();
    const bytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
    ]);
    const staged = await stageSlackImage({
      groupInboundDir: root,
      messageId: '../../message-secret',
      fileId: '../file-secret',
      bytes,
    });

    expect(staged.containerPath).toMatch(
      /^\/workspace\/ipc\/inbound\/slack\/message-[a-f0-9]{20}\/file-[a-f0-9]{20}\.png$/,
    );
    expect(staged.containerPath).not.toContain('secret');
    const hostPath = staged.containerPath.replace(
      '/workspace/ipc/inbound',
      root,
    );
    expect(await readFile(hostPath)).toEqual(bytes);
    expect((await stat(hostPath)).mode & 0o777).toBe(0o600);
  });

  it('rejects actual bytes over the vision ceiling', async () => {
    const root = await tempRoot();
    const bytes = Buffer.alloc(MAX_SLACK_IMAGE_BYTES + 1);
    bytes.set([0xff, 0xd8, 0xff]);
    await expect(
      stageSlackImage({
        groupInboundDir: root,
        messageId: '1',
        fileId: '2',
        bytes,
      }),
    ).rejects.toThrow('image_too_large');
  });

  it('prunes only derived message directories older than 30 days', async () => {
    const root = await tempRoot();
    const inboundRoot = path.join(root, 'slack');
    const oldDir = path.join(inboundRoot, 'message-old');
    const freshDir = path.join(inboundRoot, 'message-fresh');
    await mkdir(oldDir, { recursive: true });
    await mkdir(freshDir, { recursive: true });
    await writeFile(path.join(oldDir, 'old.png'), 'old');
    await writeFile(path.join(freshDir, 'fresh.png'), 'fresh');
    const now = Date.now();
    const old = new Date(now - SLACK_IMAGE_RETENTION_MS - 1_000);
    await utimes(oldDir, old, old);

    await stageSlackImage(
      {
        groupInboundDir: root,
        messageId: 'new-message',
        fileId: 'new-file',
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      },
      now,
    );

    expect(fs.existsSync(oldDir)).toBe(false);
    expect(fs.existsSync(freshDir)).toBe(true);
  });
});
