# Exact final replay code and regression

## Adapter admission/replay branch

```ts
  const parsed = receiptSchema.safeParse(candidate);
  if (!parsed.success)
    throw new EnrollmentCommandError(
      'invalid_receipt',
      'invalid bounded funding envelope',
    );
  const receipt = parsed.data;
  const authority = authoritySchema.parse(trustedAuthority);
  const fingerprint = bookkeeperContractHash(receipt);
  const sourceIdentity = bookkeeperContractHash([
    receipt.source.scope,
    receipt.source.objectType,
    receipt.source.objectId,
  ]);
  const orderKey = `bookkeeper:${sourceIdentity}`;
  const actor = 'bookkeeper-enrollment:host';
  const occurredAt = authority.occurredAt;
  let enrollment = original.enrollment;
  let capacity = original.capacity;
  const old = enrollment.orders[orderKey];
  const priorRef = Object.values(enrollment.sourceReferences).find(
    (r) =>
      r.sourceScope === receipt.source.scope &&
      r.sourceObjectType === receipt.source.objectType &&
      r.sourceObjectId === receipt.source.objectId,
  );
  const boundKey = priorRef?.orderKey ?? orderKey;
  const exceptionKeyFor = (
    subjectType: 'order' | 'seat',
    subjectKey: string,
    reasonCode: string,
  ) =>
    `bk-exception:${bookkeeperContractHash([subjectType, subjectKey, reasonCode, fingerprint])}`;
  const hold = (
    subjectType: 'order' | 'seat',
    subjectKey: string,
    reasonCode: string,
    ownerRole:
      | 'enrollment_operator'
      | 'finance_operator'
      | 'owner_admin' = 'enrollment_operator',
  ) => {
    const exceptionKey = exceptionKeyFor(subjectType, subjectKey, reasonCode);
    if (enrollment.exceptions[exceptionKey]) return;
    enrollment = openEnrollmentException(enrollment, {
      exceptionKey,
      subjectType,
      subjectKey,
      reasonCode,
      ownerRole,
      severity: 'high',
      evidenceSha256: fingerprint,
      reviewAt: occurredAt,
      actor,
      occurredAt,
    });
  };
  // A duplicate is the original decision, even when catalog, capacity, or time changed.
  if (old || priorRef) {
    if (
      priorRef?.orderKey === orderKey &&
      old &&
      enrollment.evidence[`${orderKey}:admission`]?.evidenceSha256 ===
        fingerprint
    )
      return { ...original, orderKey, duplicate: true };
    if (
      authority.acceptedReceiptSha256 !== fingerprint ||
      Date.parse(receipt.source.effectiveAt) > Date.parse(occurredAt)
    )
      throw new EnrollmentCommandError(
        'source_unverified',
        'unattested conflict cannot change an existing order',
      );
    if (
      enrollment.exceptions[
        exceptionKeyFor('order', boundKey, 'duplicate_source_conflict')
      ]
    )
      return { ...original, orderKey: boundKey, duplicate: true };
    hold('order', boundKey, 'duplicate_source_conflict', 'owner_admin');
    // Freeze pending projections from the disputed order without rewriting any
    // already verified target receipt or silently revoking entitlements.
    enrollment = structuredClone(enrollment);
    for (const projection of Object.values(enrollment.projections)) {
      if (
        enrollment.enrollments[projection.subjectKey]?.orderKey !== boundKey ||
        !['queued', 'failed'].includes(projection.state)
      )
        continue;
      const previousVersion = projection.version;
      projection.state = 'held';
      projection.version += 1;
      projection.updatedAt = occurredAt;
      enrollment.history.push({
        subjectType: 'projection',
        subjectKey: projection.projectionKey,
        previousVersion,
        newVersion: projection.version,
        commandKey: 'bookkeeper_source_hold',
        reasonCode: 'duplicate_source_conflict',
        evidenceSha256: fingerprint,
        actor,
        occurredAt,
        recordedAt: occurredAt,
      });
    }
    return { enrollment, capacity, orderKey: boundKey, duplicate: false };
  }
```

## Regression

```ts
  it('replays a resolved source conflict without freezing a later authorized projection', () => {
    const r = receipt();
    const first = run(r);
    r.seats[0].participantPartyId = 3;
    const conflict = run(r, first);
    const exception = Object.values(conflict.enrollment.exceptions)[0];
    conflict.enrollment = resolveEnrollmentException(conflict.enrollment, {
      exceptionKey: exception.exceptionKey,
      expectedVersion: exception.version,
      resolution: 'accepted_no_action',
      resolutionSha256: b,
      actor: 'synthetic-owner',
      occurredAt: at,
    });
    const projection = Object.values(conflict.enrollment.projections)[0];
    conflict.enrollment = requestProjection(conflict.enrollment, {
      ...projection,
      projectionKey: 'projection:authorized-later',
      actor: 'synthetic-owner',
      occurredAt: at,
    });
    const replay = run(r, conflict);
    expect(replay.enrollment).toEqual(conflict.enrollment);
    expect(
      replay.enrollment.projections['projection:authorized-later'].state,
    ).toBe('queued');
  });
```
