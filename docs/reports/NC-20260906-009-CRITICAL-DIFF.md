# Critical transaction and schema changes

## 147_student_enrollment_writer_claims.sql

```sql
-- Local authenticated-admission foundation only. No live writer cutover.
BEGIN;
CREATE TABLE business_v2.student_enrollment_authenticated_receipts (
  issuer_id text NOT NULL CHECK(length(issuer_id) BETWEEN 1 AND 100),
  receipt_id text NOT NULL CHECK(length(receipt_id) BETWEEN 1 AND 100),
  body_sha256 text NOT NULL CHECK(body_sha256 ~ '^[0-9a-f]{64}$'),
  source_key text NOT NULL CHECK(source_key ~ '^[0-9a-f]{64}$'),
  transport text NOT NULL CHECK(transport IN ('provider_event','provider_read','operator_decision')),
  purpose text NOT NULL CHECK(purpose IN ('funding','commercial','participant','assignment')),
  actor text NOT NULL CHECK(length(actor) BETWEEN 1 AND 100),
  role text NOT NULL CHECK(role IN ('source_adapter','finance_operator','enrollment_operator','owner_admin')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK(expires_at > issued_at),
  PRIMARY KEY(issuer_id,receipt_id)
);
ALTER TABLE business_v2.student_enrollment_authenticated_receipts OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.student_enrollment_authenticated_receipts FROM PUBLIC;
GRANT ALL ON business_v2.student_enrollment_authenticated_receipts TO nanoclaw_admin;
CREATE TRIGGER student_enrollment_authenticated_receipts_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_enrollment_authenticated_receipts
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();
CREATE TABLE business_v2.student_enrollment_writer_claims (
  source_key text PRIMARY KEY CHECK (source_key ~ '^[0-9a-f]{64}$'),
  source_scope text NOT NULL CHECK (length(source_scope) BETWEEN 1 AND 100),
  source_object_type text NOT NULL CHECK (length(source_object_type) BETWEEN 1 AND 100),
  source_object_id text NOT NULL CHECK (length(source_object_id) BETWEEN 1 AND 200),
  writer text NOT NULL CHECK (writer IN ('legacy','enrollment')),
  policy_key text NOT NULL CHECK (policy_key ~ '^[a-z0-9][a-z0-9._:-]{0,99}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  claimed_at timestamptz NOT NULL,
  claimed_by text NOT NULL CHECK (length(claimed_by) BETWEEN 1 AND 100),
  UNIQUE(source_scope,source_object_type,source_object_id)
);
ALTER TABLE business_v2.student_enrollment_writer_claims OWNER TO nanoclaw_admin;
REVOKE ALL ON business_v2.student_enrollment_writer_claims FROM PUBLIC;
GRANT ALL ON business_v2.student_enrollment_writer_claims TO nanoclaw_admin;
CREATE TRIGGER student_enrollment_writer_claims_append_only
  BEFORE UPDATE OR DELETE ON business_v2.student_enrollment_writer_claims
  FOR EACH ROW EXECUTE FUNCTION business_v2.fn_company_work_append_only();
COMMIT;
```

## rollback_147_student_enrollment_writer_claims.sql

```sql
BEGIN;
LOCK TABLE business_v2.student_enrollment_authenticated_receipts IN ACCESS EXCLUSIVE MODE;
LOCK TABLE business_v2.student_enrollment_writer_claims IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM business_v2.student_enrollment_writer_claims) THEN
    RAISE EXCEPTION 'refusing writer-claim rollback while claims exist';
  END IF;
  IF EXISTS(SELECT 1 FROM business_v2.student_enrollment_authenticated_receipts) THEN
    RAISE EXCEPTION 'refusing authenticated-receipt rollback while receipts exist';
  END IF;
END $$;
DROP TABLE business_v2.student_enrollment_writer_claims;
DROP TABLE business_v2.student_enrollment_authenticated_receipts;
COMMIT;
```

## Existing caller and disposable harness deltas

```diff
diff --git a/scripts/verify-student-enrollment-store-disposable.mjs b/scripts/verify-student-enrollment-store-disposable.mjs
index b6a67c63..f1e4aaa7 100644
--- a/scripts/verify-student-enrollment-store-disposable.mjs
+++ b/scripts/verify-student-enrollment-store-disposable.mjs
@@ -58,7 +58,9 @@ function sql(db, statement) {
 }

 /** Always generates its own fresh database. No supplied target or inherited PG routing. */
-export function runEnrollmentStoreDisposableProof() {
+export function runEnrollmentStoreDisposableProof(mode = 'store') {
+  if (!['store', 'admission'].includes(mode))
+    throw new Error('unsupported disposable proof mode');
   const database =
     'nc_student_enrollment_store_' + randomUUID().replaceAll('-', '');
   if (!safe.test(database)) throw new Error('invalid generated name');
@@ -131,11 +133,27 @@ export function runEnrollmentStoreDisposableProof() {
         'utf8',
       ),
     );
+    if (mode === 'admission') {
+      for (const name of [
+        '147_student_enrollment_writer_claims.sql',
+        'rollback_147_student_enrollment_writer_claims.sql',
+        '147_student_enrollment_writer_claims.sql',
+      ])
+        sql(
+          database,
+          fs.readFileSync(
+            path.join(root, 'data/business/migrations/nanoclaw-v2', name),
+            'utf8',
+          ),
+        );
+    }
     const worker = JSON.parse(
       run(path.join(root, 'node_modules/.bin/tsx'), [
         path.join(
           root,
-          'scripts/student-enrollment-store-disposable-worker.ts',
+          mode === 'store'
+            ? 'scripts/student-enrollment-store-disposable-worker.ts'
+            : 'scripts/student-enrollment-admission-disposable-worker.ts',
         ),
         database,
       ]),
diff --git a/src/student-enrollment-ingress.ts b/src/student-enrollment-ingress.ts
index 6d6bbbd0..ae45df73 100644
--- a/src/student-enrollment-ingress.ts
+++ b/src/student-enrollment-ingress.ts
@@ -190,12 +190,9 @@ export function enrollmentIngressProofPayload(
   };
 }

-/** Snapshot adapter; no real source retrieval or authentication happens here. */
-export function applyEnrollmentIngress(
-  original: BookkeeperEnrollmentState,
+export function parseEnrollmentIngressEnvelope(
   candidate: unknown,
-  host: EnrollmentIngressAuthority,
-): EnrollmentIngressResult {
+): EnrollmentIngressEnvelope {
   const parsed = envelopeSchema.safeParse(candidate);
   if (!parsed.success)
     throw new EnrollmentCommandError(
@@ -204,6 +201,16 @@ export function applyEnrollmentIngress(
     );
   const e = parsed.data;
   e.funding.aliases.sort((a, b) => refId(a).localeCompare(refId(b)));
+  return e;
+}
+
+/** Snapshot adapter; no real source retrieval or authentication happens here. */
+export function applyEnrollmentIngress(
+  original: BookkeeperEnrollmentState,
+  candidate: unknown,
+  host: EnrollmentIngressAuthority,
+): EnrollmentIngressResult {
+  const e = parseEnrollmentIngressEnvelope(candidate);
   const proofs = z.array(proofSchema).max(1000).parse(host.proofs);
   const at = z.iso.datetime({ offset: true }).parse(host.catalog.occurredAt);
   const fingerprint = hash(e);
diff --git a/src/student-enrollment-store.ts b/src/student-enrollment-store.ts
index a4d44d88..d359fa50 100644
--- a/src/student-enrollment-store.ts
+++ b/src/student-enrollment-store.ts
@@ -1,4 +1,5 @@
-import type { Pool } from 'pg';
+import type { Pool, PoolClient } from 'pg';
+import type { BookkeeperEnrollmentState } from './bookkeeper-enrollment-contract.js';
 import {
   applyEnrollmentIngress,
   type EnrollmentIngressAuthority,
@@ -29,6 +30,20 @@ export async function persistEnrollmentIngress(
   pool: Pick<Pool, 'connect'>,
   candidate: unknown,
   authority: EnrollmentIngressAuthority,
+): Promise<EnrollmentIngressResult> {
+  return persistEnrollmentDecision(pool, async (_client, state) =>
+    applyEnrollmentIngress(state, candidate, authority),
+  );
+}
+
+/** Trusted host composition seam, not a serialized or externally supplied callback.
+ * The decision runs under the same locks/transaction and must preserve prior state. */
+export async function persistEnrollmentDecision(
+  pool: Pick<Pool, 'connect'>,
+  decide: (
+    client: PoolClient,
+    state: BookkeeperEnrollmentState,
+  ) => Promise<EnrollmentIngressResult>,
 ): Promise<EnrollmentIngressResult> {
   const client = await pool.connect();
   let began = false;
@@ -46,7 +61,7 @@ export async function persistEnrollmentIngress(
       `LOCK TABLE ${ENROLLMENT_STORE_TABLES.map((t) => 'business_v2.' + t).join(',')} IN SHARE ROW EXCLUSIVE MODE`,
     );
     const before = await loadEnrollmentStore(client);
-    const result = applyEnrollmentIngress(before.state, candidate, authority);
+    const result = await decide(client, before.state);
     await persistEnrollmentStore(client, before, result);
     const readback = await loadEnrollmentStore(client);
     committing = true;
```
