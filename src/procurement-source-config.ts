/**
 * Host-owned Procurement source contract.
 *
 * Portal content may report which units were observed, but it cannot redefine
 * what a complete scan means. Changes here are release-bound and testable.
 */

export const CALEPROCURE_ADAPTER_VERSION = 'caleprocure-browser-v2';

export const CALEPROCURE_PLANNED_UNITS = Object.freeze([
  'coaching',
  'leadership development',
  'executive coaching',
  'organizational development',
  'change management',
  'facilitation',
  'training leadership',
  'team coaching',
  'talent development',
]);

export function plannedCaleProcureUnits(): readonly string[] {
  return CALEPROCURE_PLANNED_UNITS;
}
