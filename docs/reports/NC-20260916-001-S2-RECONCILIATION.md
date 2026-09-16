# NC-20260916-001 S2 declaration-versus-change reconciliation

The actual change matches the S1 KEEP topology:

- one `REFUND success` branch in the existing HMAC/freshness Commerce receiver;
- one refund object added only to WordPress refund Bookkeeper envelopes;
- one branch in the existing deterministic recorder child;
- one Payment Log status-cell update with exact original PSP/provider readback;
- explicit Student Roster no-action;
- one additive PII-free `business_v2.contador_adyen_refunds` table, migration
  170 and guarded empty-only rollback;
- one idempotent PostgreSQL insert/readback linked by foreign key to the original
  payment projection; and
- the existing WordPress retry job, NanoClaw route/process, Contador channel and
  release mechanism.

No new route, service, process, queue, worker, scheduler, credential, provider
call, customer communication, roster/access/capacity/lifecycle mutation or
original payment rewrite exists. Migration 170 and its rollback are included in
the immutable release inventory. The structure-only schema, release contract,
Project Map and Contador operating instructions are updated.

The walking skeleton remains bounded to the one preserved internal Adyen TEST
refund job. Release order is migration 170, NanoClaw activation, Commerce 1.22.1
payload activation, then replay only that refund job. Production refund creation
is prohibited.
