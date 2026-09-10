import type {
  EnrollmentIssuer,
  SignedEnrollmentStatement,
} from '../src/student-enrollment-admission.js';
import type {
  EnrollmentIngressEnvelope,
  EnrollmentIngressAuthority,
} from '../src/student-enrollment-ingress.js';
export function signAdmissionFixtures(
  envelope: EnrollmentIngressEnvelope,
  issuers: EnrollmentIssuer[],
  now: number,
): SignedEnrollmentStatement[];
export function admissionFixture(
  label: string,
  now: number,
  origin?: EnrollmentIssuer['transport'],
): {
  envelope: EnrollmentIngressEnvelope;
  issuers: EnrollmentIssuer[];
  catalog: Omit<EnrollmentIngressAuthority['catalog'], 'occurredAt'>;
  clock: () => number;
  setClock: (value: number) => void;
  statements: SignedEnrollmentStatement[];
};
