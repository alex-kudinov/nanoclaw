/**
 * One-time OAuth2 consent flow for Gmail API.
 * Run: npm run gmail:auth
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { URL } from 'url';

import { OAuth2Client } from 'google-auth-library';

import { readEnvFile } from './env.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
];

const PORT = parseInt(process.env.GMAIL_OAUTH_PORT || '3000', 10);

const env = readEnvFile(['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET']);
const clientId = env.GMAIL_CLIENT_ID;
const clientSecret = env.GMAIL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env\n' +
      'Create a GCP OAuth2 client at https://console.cloud.google.com/apis/credentials',
  );
  process.exit(1);
}

const redirectUri = `http://localhost:${PORT}/callback`;
const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log(`\nOpen this URL in your browser:\n\n${authUrl}\n`);
console.log(`Waiting for callback on http://localhost:${PORT}/callback ...\n`);

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('Missing authorization code');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(
        'No refresh token received. Revoke access at https://myaccount.google.com/permissions and try again.',
      );
      server.close();
      return;
    }

    // Write refresh token to .env (read-replace-write to avoid duplicates)
    const envPath = path.join(process.cwd(), '.env');
    let content = '';
    try {
      content = fs.readFileSync(envPath, 'utf-8');
    } catch {
      // .env doesn't exist yet
    }

    const lines = content.split('\n');
    const filtered = lines.filter(
      (l) => !l.trim().startsWith('GMAIL_REFRESH_TOKEN='),
    );
    filtered.push(`GMAIL_REFRESH_TOKEN=${refreshToken}`);
    fs.writeFileSync(envPath, filtered.join('\n'), 'utf-8');

    console.log('Refresh token saved to .env');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Gmail OAuth complete. You can close this tab.');
  } catch (err) {
    console.error('Token exchange failed:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Token exchange failed: ${err}`);
  }

  server.close();
});

server.listen(PORT);
