export const DISPOSABLE_PREFIX: string;
export function assertDisposableDatabaseName(database: string): string;
export function generatedDisposableDatabaseName(): string;
export function runStudentEnrollmentDisposableProof(input: {
  database: string;
}): {
  ok: boolean;
  serverVersion: string;
  tables: number;
  views: number;
  syntheticChains: number;
  expectedConstraintRefusals: number;
  populatedRollbackRefused: boolean;
  emptyRollbackPassed: boolean;
  reapplyPassed: boolean;
  databaseRemoved: boolean;
};
