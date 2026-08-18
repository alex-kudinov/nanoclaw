import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MAX_SLACK_IMAGE_BYTES = 10 * 1024 * 1024;
export const SLACK_IMAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type SupportedRasterFormat = 'png' | 'jpg' | 'gif' | 'webp';

export interface StagedSlackImage {
  containerPath: string;
  format: SupportedRasterFormat;
  bytes: number;
}

function startsWith(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

/**
 * Validate the bytes Claude Code's Read tool can render. Slack metadata and
 * filenames are untrusted hints; the file signature is authoritative.
 */
export function detectSupportedRasterFormat(
  buffer: Buffer,
): SupportedRasterFormat | null {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpg';

  const header = buffer.subarray(0, 6).toString('ascii');
  if (header === 'GIF87a' || header === 'GIF89a') return 'gif';

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function opaqueSegment(value: string, prefix: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 20);
  return `${prefix}-${digest}`;
}

async function pruneExpiredDirectories(
  root: string,
  cutoffMs: number,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const candidate = path.join(root, entry.name);
        const info = await stat(candidate);
        if (info.mtimeMs < cutoffMs) {
          // These are derived local copies. Slack remains the source of truth.
          await rm(candidate, { recursive: true, force: true });
        }
      }),
  );
}

/**
 * Atomically stage one validated Slack image beneath the destination group's
 * already-isolated IPC attachment mount. Raw Slack ids and filenames never
 * become path segments.
 */
export async function stageSlackImage(
  input: {
    groupInboundDir: string;
    messageId: string;
    fileId: string;
    bytes: Buffer;
  },
  nowMs = Date.now(),
): Promise<StagedSlackImage> {
  if (input.bytes.length > MAX_SLACK_IMAGE_BYTES) {
    throw new Error('image_too_large');
  }

  const format = detectSupportedRasterFormat(input.bytes);
  if (!format) throw new Error('unsupported_image_bytes');

  const hostRoot = path.join(input.groupInboundDir, 'slack');
  await mkdir(hostRoot, { recursive: true, mode: 0o700 });
  await pruneExpiredDirectories(hostRoot, nowMs - SLACK_IMAGE_RETENTION_MS);

  const messageDir = opaqueSegment(input.messageId, 'message');
  const fileBase = opaqueSegment(input.fileId, 'file');
  const hostDir = path.join(hostRoot, messageDir);
  const hostPath = path.join(hostDir, `${fileBase}.${format}`);
  const tempPath = path.join(hostDir, `.${fileBase}.${randomUUID()}.tmp`);
  await mkdir(hostDir, { recursive: true, mode: 0o700 });
  try {
    await writeFile(tempPath, input.bytes, { mode: 0o600, flag: 'wx' });
    await rename(tempPath, hostPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return {
    containerPath: path.posix.join(
      '/workspace/ipc',
      'inbound',
      'slack',
      messageDir,
      `${fileBase}.${format}`,
    ),
    format,
    bytes: input.bytes.length,
  };
}
