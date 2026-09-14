import { sha256Json } from './canonical.js';
import {
  runFailureFixtures,
  runProofCases,
  replayPlanSha256,
} from './replay-fixtures.js';

export interface D0ReplayReport {
  schemaVersion: 1;
  mode: 'pure_shadow_no_network_no_provider_writes';
  proofCases: ReturnType<typeof runProofCases>;
  failureFixtures: ReturnType<typeof runFailureFixtures>;
  proofPassed: number;
  failurePassed: number;
  providerWrites: 0;
  accessMutations: 0;
  partyWrites: 0;
  planSha256: string;
  reportSha256: string;
}

export function runD0Replay(): D0ReplayReport {
  const proofCases = runProofCases();
  const failureFixtures = runFailureFixtures();
  const body = {
    schemaVersion: 1 as const,
    mode: 'pure_shadow_no_network_no_provider_writes' as const,
    proofCases,
    failureFixtures,
    proofPassed: proofCases.filter((result) => result.passed).length,
    failurePassed: failureFixtures.filter((result) => result.passed).length,
    providerWrites: 0 as const,
    accessMutations: 0 as const,
    partyWrites: 0 as const,
    planSha256: replayPlanSha256(),
  };
  return { ...body, reportSha256: sha256Json(body) };
}
