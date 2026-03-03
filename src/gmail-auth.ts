/**
 * Gmail OAuth2 client — singleton cached.
 * Host process only; containers never see these credentials.
 */

import { OAuth2Client } from 'google-auth-library';
import { gmail_v1, google } from 'googleapis';

import { readEnvFile } from './env.js';

let cachedClient: gmail_v1.Gmail | null = null;
let cachedOAuth2: OAuth2Client | null = null;

function initOAuth2(): OAuth2Client {
  if (cachedOAuth2) return cachedOAuth2;

  const env = readEnvFile([
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REFRESH_TOKEN',
  ]);

  const clientId = env.GMAIL_CLIENT_ID;
  const clientSecret = env.GMAIL_CLIENT_SECRET;
  const refreshToken = env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail credentials missing. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env. Run: npm run gmail:auth',
    );
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  cachedOAuth2 = oauth2;
  return oauth2;
}

export function getOAuth2Client(): OAuth2Client {
  return initOAuth2();
}

export function getGmailClient(): gmail_v1.Gmail {
  if (cachedClient) return cachedClient;
  const auth = initOAuth2();
  cachedClient = google.gmail({ version: 'v1', auth });
  return cachedClient;
}
