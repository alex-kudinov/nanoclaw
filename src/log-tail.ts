/**
 * File-tail + output-marker parsing for detached container agents.
 *
 * Containers are spawned with stdout/stderr redirected to log FILES (not
 * pipes) so they survive daemon restarts: a pipe dies with its reader, a file
 * does not. The daemon tails the file — during a normal run and again after
 * adoption — and feeds chunks to the same marker parser the pipe used to feed.
 */
import fs from 'fs';
import { StringDecoder } from 'string_decoder';

import { logger } from './logger.js';

const READ_CHUNK_BYTES = 1 << 16;

export class LogTail {
  private offset = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private decoder = new StringDecoder('utf8');

  constructor(
    private filePath: string,
    private onChunk: (chunk: string) => void,
    private pollMs = 300,
  ) {}

  start(fromOffset = 0): void {
    if (this.timer) return;
    this.offset = fromOffset;
    this.timer = setInterval(() => this.poll(), this.pollMs);
    // Read anything already present (e.g. adoption replay) immediately.
    this.poll();
  }

  /** Byte offset consumed so far — persist for replay-free adoption. */
  getOffset(): number {
    return this.offset;
  }

  /** Synchronously read any remaining bytes (call before stop() on exit). */
  drainNow(): void {
    this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private poll(): void {
    let size: number;
    try {
      size = fs.statSync(this.filePath).size;
    } catch {
      return; // file not created yet
    }
    if (size <= this.offset) return;
    let fd: number;
    try {
      fd = fs.openSync(this.filePath, 'r');
    } catch {
      return;
    }
    try {
      while (this.offset < size) {
        const len = Math.min(size - this.offset, READ_CHUNK_BYTES);
        const buf = Buffer.alloc(len);
        const read = fs.readSync(fd, buf, 0, len, this.offset);
        if (read <= 0) break;
        this.offset += read;
        try {
          // StringDecoder holds split multibyte sequences across reads.
          this.onChunk(this.decoder.write(buf.subarray(0, read)));
        } catch (err) {
          logger.warn(
            { file: this.filePath, err },
            'LogTail consumer threw — tail continues',
          );
        }
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';
const HEARTBEAT_MARKER = '---NANOCLAW_HEARTBEAT---';

export interface OutputParserHandlers {
  /** Complete parsed marker payload (JSON already parsed). */
  onOutput: (parsed: unknown) => void;
  /** Any stdout activity — heartbeats included. Liveness proof. */
  onActivity?: () => void;
}

/**
 * Minimal marker parser for ADOPTED containers: heartbeats prove liveness,
 * START/END pairs carry ContainerOutput JSON. runContainerAgent keeps its own
 * inline parser (entangled with spawn/hard timeouts, which never apply to an
 * adopted run — its spawn succeeded under the previous daemon).
 */
export function createOutputParser(handlers: OutputParserHandlers): {
  feed: (chunk: string) => void;
  pendingBytes: () => number;
} {
  let parseBuffer = '';
  return {
    feed(chunk: string): void {
      handlers.onActivity?.();
      parseBuffer += chunk;
      if (parseBuffer.includes(HEARTBEAT_MARKER)) {
        parseBuffer = parseBuffer.split(HEARTBEAT_MARKER + '\n').join('');
      }
      let startIdx: number;
      while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
        const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
        if (endIdx === -1) break; // incomplete pair — wait for more bytes
        const jsonStr = parseBuffer
          .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
          .trim();
        parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);
        try {
          handlers.onOutput(JSON.parse(jsonStr));
        } catch (err) {
          logger.warn({ err }, 'Adopted-container output chunk parse failed');
        }
      }
      // Cap the buffer so a marker-less flood cannot grow it unboundedly.
      if (parseBuffer.length > 1_000_000) {
        parseBuffer = parseBuffer.slice(-100_000);
      }
    },
    pendingBytes(): number {
      return Buffer.byteLength(parseBuffer);
    },
  };
}
