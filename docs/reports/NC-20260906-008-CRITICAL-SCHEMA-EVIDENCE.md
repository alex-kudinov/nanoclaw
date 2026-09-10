# Exact local schema and audit correction

## 146_student_enrollment_store_contract.sql

```sql
-- Local/unapplied store prerequisite. No runtime or provider activation.
BEGIN;
ALTER TABLE business_v2.student_projection_outbox
  ADD COLUMN version integer NOT NULL DEFAULT 0
    CONSTRAINT student_projection_outbox_version_check CHECK (version >= 0);
COMMENT ON COLUMN business_v2.student_projection_outbox.version IS
  'Canonical projection version for host compare-and-swap; distinct from delivery attempts.';
ALTER TABLE business_v2.student_enrollment_history
  DROP CONSTRAINT student_enrollment_history_subject_type_check;
ALTER TABLE business_v2.student_enrollment_history
  ADD CONSTRAINT student_enrollment_history_subject_type_check CHECK (subject_type IN (
    'order', 'seat', 'enrollment', 'entitlement', 'assignment', 'agreement',
    'obligation', 'projection', 'exception', 'evidence'
  ));
COMMIT;
```

## rollback_146_student_enrollment_store_contract.sql

```sql
BEGIN;
LOCK TABLE business_v2.student_projection_outbox IN ACCESS EXCLUSIVE MODE;
LOCK TABLE business_v2.student_enrollment_history IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM business_v2.student_projection_outbox) THEN
    RAISE EXCEPTION 'refusing projection-version rollback while outbox rows exist';
  END IF;
  IF EXISTS (SELECT 1 FROM business_v2.student_enrollment_history WHERE subject_type='evidence') THEN
    RAISE EXCEPTION 'refusing store-contract rollback while evidence history exists';
  END IF;
END $$;
ALTER TABLE business_v2.student_projection_outbox DROP COLUMN version;
ALTER TABLE business_v2.student_enrollment_history
  DROP CONSTRAINT student_enrollment_history_subject_type_check;
ALTER TABLE business_v2.student_enrollment_history
  ADD CONSTRAINT student_enrollment_history_subject_type_check CHECK (subject_type IN (
    'order', 'seat', 'enrollment', 'entitlement', 'assignment', 'agreement',
    'obligation', 'projection', 'exception'
  ));
COMMIT;
```

## Evidence history identity correction

```diff
diff --git a/src/student-enrollment-foundation.ts b/src/student-enrollment-foundation.ts
index 5543d120..effc1caa 100644
--- a/src/student-enrollment-foundation.ts
+++ b/src/student-enrollment-foundation.ts
@@ -804,8 +804,8 @@ export function attachEnrollmentEvidence(
   next.evidence[input.evidenceKey] = input;
   next.history.push(
     history({
-      subjectType: input.subjectType,
-      subjectKey: input.subjectKey,
+      subjectType: 'evidence',
+      subjectKey: input.evidenceKey,
       previousVersion: null,
       commandKey: 'attach_evidence',
       reasonCode: input.evidenceType,
```
