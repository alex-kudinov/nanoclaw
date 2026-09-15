import { OAuth2Client } from 'google-auth-library';

import {
  validateGoogleAccountClaimProposal,
  type GoogleAccountClaimProposal,
  type GoogleAccountClaimProposalPolicy,
} from './google-account-claim-proposal.js';

export const GOOGLE_SERVICE_ACCOUNT_ISSUER = 'https://accounts.google.com';
export const GOOGLE_SERVICE_ACCOUNT_TOKEN_MAX_BYTES = 8_192;
export const GOOGLE_SERVICE_ACCOUNT_BODY_MAX_BYTES = 16_384;

const TOKEN_MAX_LIFETIME_SECONDS = 3_600;
const TOKEN_CLOCK_SKEW_SECONDS = 60;

export type GoogleServiceAccountTransportPolicy = {
  expectedIssuer: typeof GOOGLE_SERVICE_ACCOUNT_ISSUER;
  expectedAudience: string;
  expectedPrincipalEmail: string;
  expectedSubject: string;
  observedAt: string;
};

export type GoogleServiceAccountTransportRejection =
  | 'SERVICE_TOKEN_MISSING'
  | 'SERVICE_TOKEN_TOO_LARGE'
  | 'SERVICE_TOKEN_HEADER_INVALID'
  | 'SERVICE_IDENTITY_INVALID'
  | 'SERVICE_PRINCIPAL_INVALID'
  | 'SERVICE_TOKEN_TIME_INVALID'
  | 'SERVICE_BODY_TOO_LARGE'
  | 'SERVICE_BODY_INVALID'
  | 'SERVICE_PROPOSAL_INVALID';

export type GoogleServiceAccountTransportValidation =
  | {
      status: 'accepted';
      reasonCode: 'SERVICE_IDENTITY_VALID';
      proposal: GoogleAccountClaimProposal;
      identity: {
        issuer: typeof GOOGLE_SERVICE_ACCOUNT_ISSUER;
        audience: string;
        principalEmail: string;
        subject: string;
        issuedAt: string;
        expiresAt: string;
      };
    }
  | {
      status: 'rejected';
      reasonCode: GoogleServiceAccountTransportRejection;
    };

function reject(
  reasonCode: GoogleServiceAccountTransportRejection,
): GoogleServiceAccountTransportValidation {
  return { status: 'rejected', reasonCode };
}

function decodeProtectedHeader(token: string): unknown {
  const [encoded] = token.split('.');
  if (!encoded) throw new Error('missing header');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function validProtectedHeader(value: unknown): value is {
  alg: 'RS256';
  typ: 'JWT';
  kid: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 3 &&
    record.alg === 'RS256' &&
    record.typ === 'JWT' &&
    typeof record.kid === 'string' &&
    /^[A-Za-z0-9._-]{1,160}$/.test(record.kid)
  );
}

export async function verifyGoogleServiceAccountClaimRequest(input: {
  idToken: string;
  body: Uint8Array;
  certificates: Record<string, string>;
  transportPolicy: GoogleServiceAccountTransportPolicy;
  proposalPolicy: GoogleAccountClaimProposalPolicy;
}): Promise<GoogleServiceAccountTransportValidation> {
  if (!input.idToken) return reject('SERVICE_TOKEN_MISSING');
  if (
    Buffer.byteLength(input.idToken, 'utf8') >
    GOOGLE_SERVICE_ACCOUNT_TOKEN_MAX_BYTES
  ) {
    return reject('SERVICE_TOKEN_TOO_LARGE');
  }
  if (input.body.byteLength > GOOGLE_SERVICE_ACCOUNT_BODY_MAX_BYTES) {
    return reject('SERVICE_BODY_TOO_LARGE');
  }

  try {
    if (!validProtectedHeader(decodeProtectedHeader(input.idToken))) {
      return reject('SERVICE_TOKEN_HEADER_INVALID');
    }
  } catch {
    return reject('SERVICE_TOKEN_HEADER_INVALID');
  }

  let payload;
  try {
    const ticket = await new OAuth2Client().verifySignedJwtWithCertsAsync(
      input.idToken,
      input.certificates,
      input.transportPolicy.expectedAudience,
      [input.transportPolicy.expectedIssuer],
      TOKEN_MAX_LIFETIME_SECONDS,
    );
    payload = ticket.getPayload();
  } catch {
    return reject('SERVICE_IDENTITY_INVALID');
  }

  if (
    !payload ||
    payload.iss !== input.transportPolicy.expectedIssuer ||
    payload.aud !== input.transportPolicy.expectedAudience ||
    payload.email !== input.transportPolicy.expectedPrincipalEmail ||
    payload.email_verified !== true ||
    payload.sub !== input.transportPolicy.expectedSubject
  ) {
    return reject('SERVICE_PRINCIPAL_INVALID');
  }

  const observedAtSeconds = Date.parse(input.transportPolicy.observedAt) / 1000;
  if (
    !Number.isFinite(observedAtSeconds) ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > TOKEN_MAX_LIFETIME_SECONDS ||
    observedAtSeconds < payload.iat - TOKEN_CLOCK_SKEW_SECONDS ||
    observedAtSeconds > payload.exp + TOKEN_CLOCK_SKEW_SECONDS
  ) {
    return reject('SERVICE_TOKEN_TIME_INVALID');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(input.body),
    );
  } catch {
    return reject('SERVICE_BODY_INVALID');
  }

  try {
    const proposal = validateGoogleAccountClaimProposal(
      parsed,
      input.proposalPolicy,
    );
    if (proposal.status !== 'accepted') {
      return reject('SERVICE_PROPOSAL_INVALID');
    }
    return {
      status: 'accepted',
      reasonCode: 'SERVICE_IDENTITY_VALID',
      proposal: proposal.proposal,
      identity: {
        issuer: GOOGLE_SERVICE_ACCOUNT_ISSUER,
        audience: payload.aud,
        principalEmail: payload.email,
        subject: payload.sub,
        issuedAt: new Date(payload.iat * 1000).toISOString(),
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      },
    };
  } catch {
    return reject('SERVICE_PROPOSAL_INVALID');
  }
}
