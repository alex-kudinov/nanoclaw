import fs from 'node:fs';
import https from 'node:https';
import { google } from 'googleapis';

import { DATA_DIR } from './config.js';
import { readEnvFile } from './env.js';
import type {
  HeartbeatProjectionApi,
  HeartbeatProjectionUser,
  StudentRosterApi,
} from './student-enrollment-provider-drivers.js';

export function createStudentRosterApi(): StudentRosterApi {
  const configured = readEnvFile(['SHEETS_ROSTER_ID']);
  const spreadsheetId = configured.SHEETS_ROSTER_ID;
  const keyFile = `${DATA_DIR}/service-accounts/sheets-service-account.json`;
  if (!spreadsheetId || !fs.existsSync(keyFile))
    throw new Error('student_roster_projection_credentials_unconfigured');
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  return {
    async read(range) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      return (response.data.values ?? []).map((row) =>
        row.map((value) => String(value ?? '')),
      );
    },
    async update(range, values) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    },
    async append(range, values) {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });
      const updatedRange = response.data.updates?.updatedRange;
      if (!updatedRange)
        throw new Error('student_roster_append_response_ambiguous');
      return { updatedRange };
    },
    async clear(range) {
      await sheets.spreadsheets.values.clear({ spreadsheetId, range });
    },
  };
}

function requestHeartbeat(
  key: string,
  method: 'GET' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: unknown,
): Promise<unknown> {
  const encoded = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: 'api.heartbeat.chat',
        path: `/v0${endpoint}`,
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'User-Agent': 'TandemBot/1.0',
          ...(encoded ? { 'Content-Length': Buffer.byteLength(encoded) } : {}),
        },
      },
      (response) => {
        let responseBody = '';
        response.on('data', (chunk) => (responseBody += chunk));
        response.on('end', () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(
              new Error(`heartbeat_projection_http_${response.statusCode}`),
            );
            return;
          }
          if (!responseBody) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(responseBody));
          } catch {
            reject(new Error('heartbeat_projection_response_invalid'));
          }
        });
      },
    );
    request.on('error', () =>
      reject(new Error('heartbeat_projection_request_failed')),
    );
    request.setTimeout(30_000, () =>
      request.destroy(new Error('heartbeat_projection_request_timed_out')),
    );
    if (encoded) request.write(encoded);
    request.end();
  });
}

function heartbeatUsers(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (!value || typeof value !== 'object') return [];
  const object = value as Record<string, unknown>;
  const nested = object.data ?? object.users;
  return Array.isArray(nested)
    ? (nested as Record<string, unknown>[])
    : [object];
}

function groupIds(user: Record<string, unknown>): string[] {
  return (Array.isArray(user.groups) ? user.groups : [])
    .map((group) =>
      typeof group === 'string'
        ? group
        : group && typeof group === 'object'
          ? String((group as Record<string, unknown>).id ?? '')
          : '',
    )
    .filter((id) => /^[0-9a-f-]{36}$/.test(id));
}

export function createHeartbeatProjectionApi(): HeartbeatProjectionApi {
  const key = readEnvFile(['HEARTBEAT_API_KEY']).HEARTBEAT_API_KEY;
  if (!key) throw new Error('heartbeat_projection_credentials_unconfigured');
  return {
    async findExactUser(email): Promise<HeartbeatProjectionUser | null> {
      const response = await requestHeartbeat(
        key,
        'GET',
        `/find/users?email=${encodeURIComponent(email)}`,
      );
      const matches = heartbeatUsers(response).filter(
        (user) =>
          String(user.email ?? '')
            .trim()
            .toLowerCase() === email.trim().toLowerCase(),
      );
      if (matches.length === 0) return null;
      if (matches.length !== 1)
        throw new Error('heartbeat_participant_identity_ambiguous');
      return {
        id: String(matches[0].id ?? ''),
        email: String(matches[0].email ?? ''),
        groupIds: groupIds(matches[0]),
      };
    },
    async addMembership(groupId, email) {
      await requestHeartbeat(key, 'PUT', `/groups/${groupId}/memberships`, {
        emails: [email],
        shouldRemoveFromSiblingGroups: false,
      });
    },
    async removeMembership(groupId, email) {
      await requestHeartbeat(key, 'DELETE', `/groups/${groupId}/memberships`, {
        emails: [email],
      });
    },
  };
}
