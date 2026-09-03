BEGIN;

-- NC-20260903-002: reconcile every label the active Mailman contract may emit
-- with the live taxonomy before the host enforces canonical routing.
INSERT INTO public.classification_taxonomy (
  label,
  parent_label,
  description,
  hive_share_target,
  digest_priority,
  auto_archive,
  enabled
)
VALUES
  ('MrGru/association/event', 'MrGru/association', 'Professional association event, proposal, or membership correspondence', ARRAY['cherie','alex']::text[], 1, false, true),
  ('MrGru/client/active', 'MrGru/client', 'Email from a current paying client', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/client/dormant', 'MrGru/client', 'Email from a past client', ARRAY['cherie','alex']::text[], 1, false, true),
  ('MrGru/financial/bill', 'MrGru/financial', 'Vendor bill or invoice requiring payable handling', ARRAY['cherie']::text[], 2, false, true),
  ('MrGru/financial/receipt', 'MrGru/financial', 'Routine payment receipt', ARRAY['cherie']::text[], 0, true, true),
  ('MrGru/financial/refund', 'MrGru/financial', 'Customer refund request requiring response and review', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/internal/cofounder', 'MrGru/internal', 'Internal cofounder correspondence', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/internal/team', 'MrGru/internal', 'Routine internal team or sent-mail echo', NULL, 0, true, true),
  ('MrGru/lead/declined', 'MrGru/lead', 'Lead or prospect explicitly declined or opted out', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/lead/hot', 'MrGru/lead', 'High-intent prospect asking about enrollment, price, or an imminent cohort', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/lead/inquiry', 'MrGru/lead', 'New prospect inquiry', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/lead/offer', 'MrGru/lead', 'Lead or prospect commercial offer', ARRAY['cherie','alex']::text[], 1, false, true),
  ('MrGru/lead/reply', 'MrGru/lead', 'Reply from an existing lead or prospect conversation', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/legal/contract', 'MrGru/legal', 'Contract correspondence requiring review', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/legal/nda', 'MrGru/legal', 'Nondisclosure agreement or confidentiality terms', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/legal/notice', 'MrGru/legal', 'Legal notice requiring review', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/meeting-assets/notes', 'MrGru/meeting-assets', 'Meeting notes or transcript requiring archival handling', ARRAY['alex']::text[], 1, false, true),
  ('MrGru/meeting-assets/recording', 'MrGru/meeting-assets', 'Meeting recording requiring archival handling', ARRAY['alex']::text[], 1, false, true),
  ('MrGru/meeting-assets/zoom', 'MrGru/meeting-assets', 'Routine Zoom asset notification', NULL, 0, true, true),
  ('MrGru/newsletter/digest', 'MrGru/newsletter', 'Newsletter digest', NULL, 0, true, true),
  ('MrGru/newsletter/general', 'MrGru/newsletter', 'General newsletter', NULL, 0, true, true),
  ('MrGru/notification/calendar', 'MrGru/notification', 'Routine calendar notification', NULL, 0, true, true),
  ('MrGru/notification/monitoring', 'MrGru/notification', 'Automated website, search, uptime, or performance monitoring report', ARRAY['alex']::text[], 1, false, true),
  ('MrGru/notification/system', 'MrGru/notification', 'Routine automated platform notification', NULL, 0, true, true),
  ('MrGru/other', NULL, 'Does not fit a canonical category and requires review', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/personal', NULL, 'Personal correspondence requiring owner review', ARRAY['cherie','alex']::text[], 1, false, true),
  ('MrGru/procurement/rfp', 'MrGru/procurement', 'Procurement request for proposal', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/procurement/rfq', 'MrGru/procurement', 'Procurement request for quotation', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/recruiting/applicant', 'MrGru/recruiting', 'Job applicant correspondence', ARRAY['cherie']::text[], 1, false, true),
  ('MrGru/recruiting/outreach', 'MrGru/recruiting', 'Routine recruiting outreach', NULL, 0, true, true),
  ('MrGru/spam', NULL, 'Unsolicited irrelevant or malicious commercial email', NULL, 0, true, true),
  ('MrGru/student/support', 'MrGru/student', 'Student or customer asking for account, access, course, or administrative help', ARRAY['cherie','alex']::text[], 2, false, true),
  ('MrGru/vendor/cold', 'MrGru/vendor', 'Unsolicited vendor outreach', NULL, 0, true, true),
  ('MrGru/vendor/warm', 'MrGru/vendor', 'Known or relevant vendor correspondence', ARRAY['cherie']::text[], 1, false, true)
ON CONFLICT (label) DO UPDATE SET
  auto_archive = EXCLUDED.auto_archive,
  enabled = true,
  updated_at = NOW();

-- These existing labels are declared as host-only noise in the operational
-- contract. Correct the live flags so they cannot fall through to Chief.
UPDATE public.classification_taxonomy
   SET auto_archive = true,
       updated_at = NOW()
 WHERE label IN ('MrGru/internal/team', 'MrGru/notification/calendar');

COMMIT;
