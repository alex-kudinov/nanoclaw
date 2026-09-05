export const DISPOSABLE_PREFIX: string;
export function assertDisposableDatabaseName(database: string): string;
export function generatedDisposableDatabaseName(): string;
export function databaseExists(database: string): boolean;
export interface DisposableProofContext {
  database: string;
  execute(sql: string): void;
  executeFile(filePath: string): void;
  expectFailure(sql: string, expectedMessage: RegExp): void;
  expectFileFailure(filePath: string, expectedMessage: RegExp): void;
  scalar(sql: string): string;
  expectScalar(sql: string, expected: string, label: string): void;
}
export interface DisposableProofExtension {
  afterEnrollmentMigration?(context: DisposableProofContext): void;
  afterSyntheticChain?(context: DisposableProofContext): void;
  afterEnrollmentReapply?(context: DisposableProofContext): void;
}
export function runStudentEnrollmentDisposableProof(input: {
  database: string;
  extension?: DisposableProofExtension;
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
