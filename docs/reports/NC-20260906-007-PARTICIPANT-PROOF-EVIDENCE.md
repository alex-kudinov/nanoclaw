# Independently executed R1 reproduction

Exact regression from src/student-enrollment-ingress.test.ts:

```ts
  it('retains verified funding capacity but never materializes a student with invalid participant proof', () => {
    const e = envelope();
    const h = authority(e);
    h.proofs = h.proofs.filter((p) => p.purpose !== 'participant');
    const out = run(e, state(), h);
    expect(out.disposition).toBe('held');
    expect(reasons(out)).toContain('participant_missing');
    expect(Object.keys(out.enrollment.enrollments)).toHaveLength(0);
    expect(Object.keys(out.enrollment.entitlements)).toHaveLength(0);
    expect(Object.keys(out.enrollment.assignments)).toHaveLength(0);
    expect(Object.keys(out.enrollment.projections)).toHaveLength(0);
    expect(Object.values(out.enrollment.seats)[0]).toMatchObject({
      participantPartyId: null,
      state: 'unassigned',
    });
    expect(Object.values(out.capacity.reservations)).toHaveLength(1);
    expect(Object.values(out.capacity.reservations)[0]).toMatchObject({
      channel: 'commitment',
      state: 'held',
    });
    expect(
      showInventory(out.capacity, out.enrollment, 'pool:synthetic', at)
        .available,
    ).toBe(2);
  });
  it.each(['funding', 'commercial'] as const)(
    'holds missing %s evidence in canonical intake without claiming payment aliases',
    (purpose) => {
      const e = envelope();
      const auth = authority(e);
      auth.proofs = auth.proofs.filter((p) => p.purpose !== purpose);
      const out = run(e, state(), auth);
      expect(reasons(out)).toEqual([`${purpose}_evidence_unverified`]);
      expect(
        Object.values(out.enrollment.sourceReferences).every(
          (r) => r.sourceScope === 'enrollment_intake',
        ),
      ).toBe(true);
      expect(Object.keys(out.enrollment.seats)).toHaveLength(0);
    },
  );
```

Execution with Node 22.23.2: vitest run src/student-enrollment-ingress.test.ts -t "retains verified funding capacity" passed 1/1; 34 unrelated tests skipped. No source code changed to obtain this result. The default fixture is manual Stripe, Party 2 proposed as a separate participant, with independently verified funding, commercial and class proofs; only the participant proof is removed. It returns 0 student enrollments, 0 entitlements, 0 class assignments, 0 projections, one unassigned seat, one owned participant_missing exception, and one held funded capacity commitment.
