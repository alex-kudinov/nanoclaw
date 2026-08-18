import { describe, expect, it } from 'vitest';

import {
  COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION,
  formatCompanyGmailMailboxAuditReport,
  parseCompanyGmailMailboxAuditArgs,
} from './company-gmail-mailbox-audit-cli.js';

describe('Company Gmail mailbox audit CLI', () => {
  it('requires an exact bounded start confirmation', () => {
    expect(
      parseCompanyGmailMailboxAuditArgs([
        '--start',
        '--max-pages',
        '1',
        '--confirm-read-only',
        COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION,
      ]),
    ).toEqual({
      mode: 'start',
      auditId: null,
      maxPages: 1,
      confirmation: COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION,
    });
  });

  it('requires a valid audit ID to resume', () => {
    expect(() =>
      parseCompanyGmailMailboxAuditArgs([
        '--resume',
        'not-an-id',
        '--max-pages',
        '1',
        '--confirm-read-only',
        COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION,
      ]),
    ).toThrow('--resume requires a lowercase SHA-256 audit ID');
  });

  it('refuses missing confirmation and unbounded page counts', () => {
    expect(() =>
      parseCompanyGmailMailboxAuditArgs(['--start', '--max-pages', '1']),
    ).toThrow('exact read-only audit confirmation is required');
    expect(() =>
      parseCompanyGmailMailboxAuditArgs([
        '--start',
        '--max-pages',
        '21',
        '--confirm-read-only',
        COMPANY_GMAIL_MAILBOX_AUDIT_CONFIRMATION,
      ]),
    ).toThrow('--max-pages must be between 1 and 20');
  });

  it('formats only the aggregate report it receives', () => {
    const output = formatCompanyGmailMailboxAuditReport({
      contractVersion: 1,
      auditId: 'a'.repeat(64),
      status: 'pending',
      version: 1,
      pagesRead: 1,
      candidateCount: 1,
      acceptedCount: 0,
      rejectedCount: 0,
      unknownCount: 1,
      auditEvidenceSha256: null,
      invalidReason: null,
      safety: {
        gmailReadScope: 'profile_and_unfiltered_id_listing_only',
        gmailContentRead: false,
        sqliteWritten: false,
        cursorWritten: false,
        messagesRecovered: 0,
        actionAuthority: 'none',
      },
    });
    expect(JSON.parse(output)).toMatchObject({
      candidateCount: 1,
      unknownCount: 1,
    });
    expect(output).not.toMatch(/messageId|pageToken|historyId/);
  });
});
