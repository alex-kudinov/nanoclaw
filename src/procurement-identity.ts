export interface CaleProcureDepartment {
  businessUnit: string;
  name: string;
}

export interface CaleProcureDetailIdentity {
  eventId: string;
  title: string;
  agency: string;
}

export function normalizeCaleProcureIdentity(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
}

export function resolveCaleProcureBusinessUnit(
  departments: readonly CaleProcureDepartment[],
  agency: string,
): CaleProcureDepartment {
  const expected = normalizeCaleProcureIdentity(agency);
  const matches = departments.filter(
    (department) => normalizeCaleProcureIdentity(department.name) === expected,
  );
  if (matches.length !== 1) {
    throw new Error(
      `CaleProcure department identity is ambiguous for ${JSON.stringify(agency)}: ${matches.length} exact matches`,
    );
  }
  return matches[0];
}

export function assertCaleProcureDetailIdentity(
  expected: CaleProcureDetailIdentity,
  observed: CaleProcureDetailIdentity,
): void {
  if (observed.eventId.trim() !== expected.eventId.trim()) {
    throw new Error(
      `CaleProcure detail event ID mismatch: expected ${expected.eventId}, observed ${observed.eventId}`,
    );
  }
  if (
    normalizeCaleProcureIdentity(observed.agency) !==
    normalizeCaleProcureIdentity(expected.agency)
  ) {
    throw new Error(
      `CaleProcure detail department mismatch for event ${expected.eventId}`,
    );
  }
  if (
    normalizeCaleProcureIdentity(observed.title) !==
    normalizeCaleProcureIdentity(expected.title)
  ) {
    throw new Error(
      `CaleProcure detail title mismatch for event ${expected.eventId}`,
    );
  }
}
