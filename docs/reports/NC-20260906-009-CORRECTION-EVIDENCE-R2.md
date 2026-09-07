# R1 reproduction and bounded correction

Before changing runtime source, actual disposable PostgreSQL reproduced R1's correction scenario against an existing legacy owner: held correction_requires_resolution, zero new enrollments, unchanged legacy owner and exactly one legacy effect. The claimed duplicate enrollment did not occur. Separately, a new funding-only channel-tampering unit test failed before correction (verify did not reject) and passes after channel binding.

## Existing predecessor proof payload and correction guard

```ts
export function enrollmentIngressProofPayload(
  e: EnrollmentIngressEnvelope,
  purpose: Purpose,
  seatIndex = 0,
): unknown {
  const source = e.funding.source;
  if (purpose === 'funding')
    return {
      purpose,
      funding: canonicalFunding(e),
      aliases: [...e.funding.aliases].sort((a, b) =>
        refId(a).localeCompare(refId(b)),
      ),
    };
  if (purpose === 'commercial') {
    const { proofKey: _proof, ...commercial } = e.commercial;
    return { purpose, source, channel: e.channel, commercial };
  }
  const seat = e.seats[seatIndex];
  if (!seat)
    throw new EnrollmentCommandError('invalid_seat', 'proof seat is absent');
  const context = {
    purpose,
    source,
    channel: e.channel,
    offerKey: e.commercial.offerKey,
    seatCount: e.commercial.seatCount,
    seatNumber: seatIndex + 1,
    participantPartyId: seat.participantPartyId,
  };
  if (purpose === 'participant')
    return { ...context, payerRelationship: seat.payerRelationship };
  return {
    ...context,
    assignment: seat.assignment
      ? {
          poolKey: seat.assignment.poolKey,
          componentKey: seat.assignment.componentKey,
        }
      : null,
  };
}


  if (e.channel === 'migration_or_correction')
    return quarantine('correction_requires_resolution', 'owner_admin');
  const grant =
```

## Exact correction diff

```diff
diff --git a/scripts/enrollment-admission-fixtures.mjs b/scripts/enrollment-admission-fixtures.mjs
index 47df4976..b540ffcf 100644
--- a/scripts/enrollment-admission-fixtures.mjs
+++ b/scripts/enrollment-admission-fixtures.mjs
@@ -20,8 +20,10 @@ export function signAdmissionFixtures(envelope, issuers, now) {
       audience: 'enrollment_admission_v1',
       issuerId: issuer.issuerId,
       transport: issuer.transport,
+      channel: envelope.channel,
       receiptId:
-        'receipt:' + hash([issuer.issuerId, payload, now]).slice(0, 32),
+        'receipt:' +
+        hash([issuer.issuerId, envelope.channel, payload, now]).slice(0, 32),
       proofKey,
       purpose,
       issuedAt: now,
@@ -95,6 +97,7 @@ export function admissionFixture(label, now, origin = 'provider_event') {
       transport: origin,
       purposes: ['funding'],
       sourceScopes: ['stripe:tandem'],
+      channels: [envelope.channel],
       key: randomBytes(32),
     },
     {
@@ -104,6 +107,7 @@ export function admissionFixture(label, now, origin = 'provider_event') {
       transport: 'operator_decision',
       purposes: ['commercial', 'participant', 'assignment'],
       sourceScopes: ['stripe:tandem'],
+      channels: [envelope.channel],
       key: randomBytes(32),
     },
   ];
diff --git a/scripts/student-enrollment-admission-disposable-worker.ts b/scripts/student-enrollment-admission-disposable-worker.ts
index 71e84d7a..d42ec514 100644
--- a/scripts/student-enrollment-admission-disposable-worker.ts
+++ b/scripts/student-enrollment-admission-disposable-worker.ts
@@ -241,6 +241,71 @@ try {
     1,
   );
   summary.legacyBlocked = true;
+  const correction = fixture('legacy', 5, 'operator_decision');
+  correction.envelope.channel = 'migration_or_correction';
+  correction.issuers[0].issuerId = 'issuer:correction-finance';
+  correction.issuers[1].issuerId = 'issuer:correction-operator';
+  correction.issuers.forEach((i) => {
+    i.channels = ['migration_or_correction'];
+  });
+  correction.statements = signAdmissionFixtures(
+    correction.envelope,
+    correction.issuers,
+    now,
+  );
+  const correctionGate = service(correction);
+  const correctionResult = await correctionGate.admit(
+    admin,
+    correctionGate.verify(correction.envelope, correction.statements),
+  );
+  assert.equal(correctionResult.disposition, 'held');
+  assert.deepEqual(
+    correctionResult.enrollment.enrollments,
+    blocked.enrollment.enrollments,
+  );
+  assert.deepEqual(
+    correctionResult.enrollment.entitlements,
+    blocked.enrollment.entitlements,
+  );
+  assert.deepEqual(
+    correctionResult.enrollment.assignments,
+    blocked.enrollment.assignments,
+  );
+  assert.deepEqual(
+    correctionResult.enrollment.projections,
+    blocked.enrollment.projections,
+  );
+  assert.deepEqual(correctionResult.capacity, blocked.capacity);
+  assert(
+    Object.values(correctionResult.enrollment.exceptions).some(
+      (e) => e.reasonCode === 'correction_requires_resolution',
+    ),
+  );
+  assert.equal(
+    Object.values(correctionResult.enrollment.enrollments).filter(
+      (e) => e.orderKey === 'bookkeeper:' + sourceKey(correction),
+    ).length,
+    0,
+  );
+  assert.equal(
+    (
+      await query(
+        'SELECT writer FROM business_v2.student_enrollment_writer_claims WHERE source_key=$1',
+        [sourceKey(correction)],
+      )
+    ).rows[0].writer,
+    'legacy',
+  );
+  assert.equal(
+    (
+      await query(
+        'SELECT count(*)::int n FROM business_v2.fixture_legacy_effects WHERE source_key=$1',
+        [sourceKey(correction)],
+      )
+    ).rows[0].n,
+    1,
+  );
+  summary.correctionReviewOnly = true;
   assert.equal(await legacy(fixture('event')), false);

   const race = fixture('race', 6);
@@ -409,6 +474,7 @@ try {
   grant.envelope.commercial.currency = null;
   grant.envelope.seats[0].payerRelationship = 'not_applicable';
   for (const issuer of grant.issuers) {
+    issuer.channels = ['scholarship'];
     issuer.role = 'owner_admin';
     issuer.sourceScopes = ['owner:synthetic'];
   }
@@ -427,6 +493,9 @@ try {

   const sponsor = fixture('sponsor', 9, 'operator_decision');
   sponsor.envelope.channel = 'sponsored_cohort';
+  sponsor.issuers.forEach((i) => {
+    i.channels = ['sponsored_cohort'];
+  });
   sponsor.envelope.commercial.seatCount = 2;
   sponsor.envelope.seats.push({
     participantPartyId: null,
diff --git a/src/student-enrollment-admission.test.ts b/src/student-enrollment-admission.test.ts
index 14347138..01da8c37 100644
--- a/src/student-enrollment-admission.test.ts
+++ b/src/student-enrollment-admission.test.ts
@@ -112,6 +112,14 @@ describe('local authenticated enrollment admission', () => {
       'ambiguous_proof_key',
     );
   });
+  it('binds the routing channel even when only funding evidence is available', () => {
+    const f = admissionFixture('channel', now);
+    const gate = service(f);
+    f.envelope.channel = 'migration_or_correction';
+    expect(() => gate.verify(f.envelope, [f.statements[0]])).toThrow(
+      'statement_binding_denied',
+    );
+  });
   it('enforces issuer role capability registration and does not accept caller-supplied roles', () => {
     const f = admissionFixture('role', now);
     f.issuers[0].purposes.push('assignment');
@@ -146,6 +154,7 @@ describe('local authenticated enrollment admission', () => {
     const gate = service(f);
     f.issuers[0].key.fill(0);
     f.issuers[0].sourceScopes.length = 0;
+    f.issuers[0].channels.length = 0;
     f.issuers[0].role = 'owner_admin';
     expect(gate.verify(f.envelope, f.statements)).toBeTruthy();
   });
@@ -157,6 +166,14 @@ describe('local authenticated enrollment admission', () => {
     g.issuers[1].key = g.issuers[0].key;
     expect(() => service(g)).toThrow('issuer_key_reuse');
   });
+  it('cannot register a provider for correction routing or a non-owner for grants', () => {
+    const f = admissionFixture('routingrole', now);
+    f.issuers[0].channels = ['migration_or_correction'];
+    expect(() => service(f)).toThrow('invalid_issuer_channel');
+    const g = admissionFixture('grantrole', now, 'operator_decision');
+    g.issuers[0].channels = ['scholarship'];
+    expect(() => service(g)).toThrow('invalid_issuer_channel');
+  });
   it('rejects two different proofs using one issuer receipt ID in a bundle', () => {
     const f = admissionFixture('receiptid', now);
     const a = JSON.parse(f.statements[1].body),
@@ -213,6 +230,7 @@ describe('local authenticated enrollment admission', () => {
       authenticatedGrant: true,
       partialSponsor: true,
       controlReadback: true,
+      correctionReviewOnly: true,
       nonAdminGrants: 0,
     });
   }, 60000);
diff --git a/src/student-enrollment-admission.ts b/src/student-enrollment-admission.ts
index 49b4005f..1974bb75 100644
--- a/src/student-enrollment-admission.ts
+++ b/src/student-enrollment-admission.ts
@@ -30,6 +30,16 @@ const transport = z.enum([
   'operator_decision',
 ]);
 type Purpose = EnrollmentIngressProof['purpose'];
+const channelSchema = z.enum([
+  'website_stripe_checkout',
+  'manual_stripe_payment',
+  'plutio_invoice_or_contract',
+  'check_ach_or_wire',
+  'sponsored_cohort',
+  'scholarship',
+  'complimentary_owner_grant',
+  'migration_or_correction',
+]);
 type Role = EnrollmentIngressProof['role'];
 export interface EnrollmentIssuer {
   issuerId: string;
@@ -38,6 +48,7 @@ export interface EnrollmentIssuer {
   transport: z.infer<typeof transport>;
   purposes: Purpose[];
   sourceScopes: string[];
+  channels: EnrollmentIngressEnvelope['channel'][];
   key: Uint8Array;
 }
 export interface SignedEnrollmentStatement {
@@ -50,6 +61,7 @@ const statementSchema = z.strictObject({
   audience: z.literal('enrollment_admission_v1'),
   issuerId: key,
   transport,
+  channel: channelSchema,
   receiptId: key,
   proofKey: key,
   purpose: z.enum(['funding', 'commercial', 'participant', 'assignment']),
@@ -304,6 +316,7 @@ export function createEnrollmentAdmission(config: {
     key.parse(input.issuerId);
     key.parse(input.actor);
     transport.parse(input.transport);
+    const channels = z.array(channelSchema).min(1).max(8).parse(input.channels);
     if (
       issuers.has(input.issuerId) ||
       !Object.hasOwn(roles, input.role) ||
@@ -318,6 +331,15 @@ export function createEnrollmentAdmission(config: {
       (input.role === 'source_adapter')
     )
       throw new Error('invalid_issuer_transport_role');
+    if (
+      (channels.includes('migration_or_correction') &&
+        input.transport !== 'operator_decision') ||
+      (channels.some(
+        (c) => c === 'scholarship' || c === 'complimentary_owner_grant',
+      ) &&
+        input.role !== 'owner_admin')
+    )
+      throw new Error('invalid_issuer_channel');
     const keyFingerprint = createHash('sha256').update(input.key).digest('hex');
     if (issuerKeys.has(keyFingerprint)) throw new Error('issuer_key_reuse');
     issuerKeys.add(keyFingerprint);
@@ -326,6 +348,7 @@ export function createEnrollmentAdmission(config: {
       ...input,
       purposes: [...input.purposes],
       sourceScopes: [...input.sourceScopes],
+      channels,
       key: Buffer.from(input.key),
     });
   }
@@ -394,6 +417,8 @@ export function createEnrollmentAdmission(config: {
         if (
           statement.issuerId !== issuer.issuerId ||
           statement.transport !== issuer.transport ||
+          statement.channel !== e.channel ||
+          !issuer.channels.includes(e.channel) ||
           !issuer.purposes.includes(statement.purpose) ||
           !issuer.sourceScopes.includes(e.funding.source.scope) ||
           !target ||
@@ -460,8 +485,14 @@ export function createEnrollmentAdmission(config: {
             at,
             'authenticated_receipt_conflict',
           );
+        else if (e.channel === 'migration_or_correction')
+          result = admissionHold(
+            state,
+            e,
+            at,
+            'correction_requires_resolution',
+          );
         else if (
-          e.channel !== 'migration_or_correction' &&
           !(await claimEnrollmentWriter(
             client,
             e.funding.source,
```
