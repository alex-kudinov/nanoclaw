import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_GRADER_FILE_BYTES = 25 * 1024 * 1024;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

export interface GraderFileMessagePayload {
  type: 'slack_file_message';
  text: string;
  staged_path: string;
  filename: string;
  size: number;
  sha256: string;
  idempotency_key: string;
  targetGroupFolder?: string;
}

export interface GraderFileDelivery {
  messageTs: string;
  fileIds?: string[];
}

export interface GraderFileMessageDeps {
  dataDir: string;
  targetJid: string;
  postGraderFileMessage: (
    targetJid: string,
    text: string,
    file: Buffer,
    filename: string,
    sourceGroup: string,
  ) => Promise<GraderFileDelivery>;
}

export interface GraderFileReceipt {
  version: 1;
  status: 'pending' | 'complete';
  idempotencyKey: string;
  sourceGroup: string;
  targetGroup: 'grader';
  filename: string;
  size: number;
  sha256: string;
  requestHash: string;
  createdAt: string;
  updatedAt: string;
  messageTs?: string;
  fileIds?: string[];
  lastError?: string;
}

export type GraderFileDispatchResult =
  | { status: 'complete'; receipt: GraderFileReceipt }
  | { status: 'duplicate_complete'; receipt: GraderFileReceipt }
  | { status: 'pending'; receipt: GraderFileReceipt };

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
  fs.renameSync(tempPath, filePath);
}

function receiptPath(
  dataDir: string,
  sourceGroup: string,
  idempotencyKey: string,
): string {
  const keyHash = crypto
    .createHash('sha256')
    .update(idempotencyKey)
    .digest('hex');
  return path.join(
    dataDir,
    'ipc',
    sourceGroup,
    'receipts',
    'grader-file',
    `${keyHash}.json`,
  );
}

function readReceipt(filePath: string): GraderFileReceipt | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GraderFileReceipt;
}

function validatePayload(
  sourceGroup: string,
  payload: GraderFileMessagePayload,
  dataDir: string,
): { file: Buffer; size: number; sha256: string } {
  if (
    typeof payload.idempotency_key !== 'string' ||
    !IDEMPOTENCY_KEY_RE.test(payload.idempotency_key)
  ) {
    throw new Error('invalid grader file idempotency key');
  }
  if (
    typeof payload.text !== 'string' ||
    !payload.text ||
    payload.text.length > 4_000
  ) {
    throw new Error('grader file text must contain 1-4000 characters');
  }
  if (
    typeof payload.filename !== 'string' ||
    !payload.filename ||
    payload.filename !== path.basename(payload.filename) ||
    payload.filename === '.' ||
    payload.filename === '..'
  ) {
    throw new Error('invalid grader file display name');
  }
  if (
    !Number.isSafeInteger(payload.size) ||
    payload.size <= 0 ||
    payload.size > MAX_GRADER_FILE_BYTES
  ) {
    throw new Error('grader file size is outside the 1-byte to 25-MB limit');
  }
  if (typeof payload.sha256 !== 'string' || !SHA256_RE.test(payload.sha256)) {
    throw new Error('invalid grader file sha256');
  }
  if (
    typeof payload.staged_path !== 'string' ||
    !payload.staged_path ||
    path.isAbsolute(payload.staged_path) ||
    payload.staged_path.split(/[\\/]/).includes('..')
  ) {
    throw new Error('grader file staged path must be relative and contained');
  }

  const attachmentsRoot = path.join(dataDir, 'ipc', sourceGroup, 'attachments');
  const candidate = path.resolve(
    path.join(dataDir, 'ipc', sourceGroup),
    payload.staged_path,
  );
  const rootWithSep = `${path.resolve(attachmentsRoot)}${path.sep}`;
  if (!candidate.startsWith(rootWithSep)) {
    throw new Error('grader file staged path is outside attachments');
  }

  const lstat = fs.lstatSync(candidate);
  if (lstat.isSymbolicLink() || !lstat.isFile()) {
    throw new Error('grader file must be a regular non-symlink file');
  }
  const realRoot = fs.realpathSync(attachmentsRoot);
  const realFile = fs.realpathSync(candidate);
  if (!realFile.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error('grader file resolves outside attachments');
  }
  if (lstat.size !== payload.size) {
    throw new Error('grader file size does not match staged metadata');
  }
  // Snapshot the bytes once after path validation. The container can write to
  // its IPC mount, so passing the staged path onward would create a TOCTOU gap
  // between verification, inline conversion, and Slack's later file read.
  const file = fs.readFileSync(realFile);
  if (file.length !== payload.size) {
    throw new Error('grader file changed while being verified');
  }
  const actualSha256 = crypto.createHash('sha256').update(file).digest('hex');
  if (actualSha256 !== payload.sha256) {
    throw new Error('grader file sha256 does not match staged metadata');
  }
  return { file, size: file.length, sha256: actualSha256 };
}

/**
 * Deliver one staged file to the fixed grader destination. A durable pending
 * receipt is written before Slack is touched. If the process loses certainty
 * after that point, the same idempotency key is held instead of retried.
 */
export async function dispatchGraderFileMessage(
  sourceGroup: string,
  payload: GraderFileMessagePayload,
  deps: GraderFileMessageDeps,
): Promise<GraderFileDispatchResult> {
  if (payload.type !== 'slack_file_message') {
    throw new Error('unexpected grader file IPC type');
  }
  if (payload.targetGroupFolder && payload.targetGroupFolder !== 'grader') {
    throw new Error('grader file destination is fixed to grader');
  }
  if (
    typeof payload.idempotency_key !== 'string' ||
    !IDEMPOTENCY_KEY_RE.test(payload.idempotency_key)
  ) {
    throw new Error('invalid grader file idempotency key');
  }
  const requestHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        text: payload.text,
        filename: payload.filename,
        size: payload.size,
        sha256: payload.sha256,
      }),
    )
    .digest('hex');

  const receiptFile = receiptPath(
    deps.dataDir,
    sourceGroup,
    payload.idempotency_key,
  );
  const existing = readReceipt(receiptFile);
  if (existing) {
    if (
      existing.idempotencyKey !== payload.idempotency_key ||
      existing.requestHash !== requestHash
    ) {
      throw new Error('idempotency key was already used for different content');
    }
    return existing.status === 'complete'
      ? { status: 'duplicate_complete', receipt: existing }
      : { status: 'pending', receipt: existing };
  }

  const validated = validatePayload(sourceGroup, payload, deps.dataDir);
  const now = new Date().toISOString();
  const pending: GraderFileReceipt = {
    version: 1,
    status: 'pending',
    idempotencyKey: payload.idempotency_key,
    sourceGroup,
    targetGroup: 'grader',
    filename: payload.filename,
    size: validated.size,
    sha256: validated.sha256,
    requestHash,
    createdAt: now,
    updatedAt: now,
  };
  atomicWriteJson(receiptFile, pending);

  try {
    const delivery = await deps.postGraderFileMessage(
      deps.targetJid,
      payload.text,
      validated.file,
      payload.filename,
      sourceGroup,
    );
    const complete: GraderFileReceipt = {
      ...pending,
      status: 'complete',
      updatedAt: new Date().toISOString(),
      messageTs: delivery.messageTs,
      fileIds: delivery.fileIds,
    };
    atomicWriteJson(receiptFile, complete);
    return { status: 'complete', receipt: complete };
  } catch (err) {
    const uncertain: GraderFileReceipt = {
      ...pending,
      updatedAt: new Date().toISOString(),
      lastError: err instanceof Error ? err.message : String(err),
    };
    atomicWriteJson(receiptFile, uncertain);
    throw err;
  }
}

export function isGraderFileMessageType(type: unknown): boolean {
  return type === 'slack_file_message';
}
