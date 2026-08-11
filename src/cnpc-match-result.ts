import crypto from 'crypto';

import { withAgentContext } from './business-db.js';
import {
  CNPC_MATCH_PROMPT_VERSION,
  type CnpcPreparedIntake,
} from './cnpc-intake.js';

export interface CnpcMatchRecommendation {
  coach_id: number;
  rank: number;
  fit_score: number;
  recommendation_role: 'primary' | 'alternate' | 'backup';
  reasons: string[];
}

export interface CnpcMatchResult {
  intake_id: number;
  roster_version: string;
  recommendations: CnpcMatchRecommendation[];
}

export class CnpcMatchResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CnpcMatchResultError';
  }
}

const RESULT_RE = /<cnpc_match_result>\s*([\s\S]*?)\s*<\/cnpc_match_result>/i;

export function stripCnpcMatchResult(text: string): string {
  return text.replace(RESULT_RE, '').trim();
}

function requiredInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value)) {
    throw new CnpcMatchResultError(`${field} must be an integer`);
  }
  return value as number;
}

export function parseAndValidateCnpcMatchResult(
  output: string,
  prepared: CnpcPreparedIntake,
): CnpcMatchResult {
  const match = output.match(RESULT_RE);
  if (!match) {
    throw new CnpcMatchResultError('missing <cnpc_match_result> block');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(match[1]);
  } catch {
    throw new CnpcMatchResultError('cnpc_match_result is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CnpcMatchResultError('cnpc_match_result must be an object');
  }
  const value = raw as Record<string, unknown>;
  const intakeId = requiredInteger(value.intake_id, 'intake_id');
  if (intakeId !== prepared.intake.id) {
    throw new CnpcMatchResultError('intake_id does not match host context');
  }
  if (value.roster_version !== prepared.match_pool.roster_version) {
    throw new CnpcMatchResultError(
      'roster_version does not match host context',
    );
  }
  if (!Array.isArray(value.recommendations)) {
    throw new CnpcMatchResultError('recommendations must be an array');
  }
  const expectedMaximum = Math.min(3, prepared.match_pool.candidate_count);
  if (
    value.recommendations.length < 1 ||
    value.recommendations.length > expectedMaximum
  ) {
    throw new CnpcMatchResultError(
      `recommendations must contain 1-${expectedMaximum} candidates`,
    );
  }

  const allowedCandidates = new Set(
    prepared.match_pool.candidates.map((candidate) => candidate.coach_id),
  );
  const seen = new Set<number>();
  const roles = ['primary', 'alternate', 'backup'] as const;
  const recommendations = value.recommendations.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new CnpcMatchResultError(
        `recommendations[${index}] must be an object`,
      );
    }
    const row = item as Record<string, unknown>;
    const coachId = requiredInteger(
      row.coach_id,
      `recommendations[${index}].coach_id`,
    );
    if (!allowedCandidates.has(coachId)) {
      throw new CnpcMatchResultError(
        `coach_id ${coachId} is outside the host-provided match pool`,
      );
    }
    if (seen.has(coachId)) {
      throw new CnpcMatchResultError(`coach_id ${coachId} is duplicated`);
    }
    seen.add(coachId);

    const rank = requiredInteger(row.rank, `recommendations[${index}].rank`);
    if (rank !== index + 1) {
      throw new CnpcMatchResultError('recommendation ranks must be contiguous');
    }
    const fitScore = requiredInteger(
      row.fit_score,
      `recommendations[${index}].fit_score`,
    );
    if (fitScore < 0 || fitScore > 100) {
      throw new CnpcMatchResultError('fit_score must be between 0 and 100');
    }
    if (row.recommendation_role !== roles[index]) {
      throw new CnpcMatchResultError(
        `rank ${rank} must use recommendation_role=${roles[index]}`,
      );
    }
    if (
      !Array.isArray(row.reasons) ||
      row.reasons.length < 1 ||
      row.reasons.length > 5 ||
      row.reasons.some(
        (reason) =>
          typeof reason !== 'string' ||
          !reason.trim() ||
          reason.trim().length > 500,
      )
    ) {
      throw new CnpcMatchResultError(
        `recommendations[${index}].reasons must contain 1-5 short strings`,
      );
    }
    return {
      coach_id: coachId,
      rank,
      fit_score: fitScore,
      recommendation_role: roles[index],
      reasons: (row.reasons as string[]).map((reason) => reason.trim()),
    };
  });

  return {
    intake_id: intakeId,
    roster_version: prepared.match_pool.roster_version,
    recommendations,
  };
}

export async function recordCnpcMatchResult(
  result: CnpcMatchResult,
  prepared: CnpcPreparedIntake,
): Promise<number> {
  const resultHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(result))
    .digest('hex');
  return withAgentContext('cnpc:host', async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO business_v2.cnpc_match_runs
         (intake_id, roster_version, prompt_version, result_sha256, status)
       VALUES ($1, $2, $3, $4, 'draft')
       ON CONFLICT (intake_id, roster_version, prompt_version) DO NOTHING
       RETURNING id::text`,
      [
        result.intake_id,
        result.roster_version,
        CNPC_MATCH_PROMPT_VERSION,
        resultHash,
      ],
    );
    let runId = Number(inserted.rows[0]?.id);
    if (!runId) {
      const existing = await client.query<{
        id: string;
        result_sha256: string;
      }>(
        `SELECT id::text, result_sha256
           FROM business_v2.cnpc_match_runs
          WHERE intake_id = $1
            AND roster_version = $2
            AND prompt_version = $3`,
        [result.intake_id, result.roster_version, CNPC_MATCH_PROMPT_VERSION],
      );
      runId = Number(existing.rows[0]?.id);
      if (!runId) throw new Error('CNPC match run could not be resolved');
      if (existing.rows[0].result_sha256 !== resultHash) {
        throw new Error(
          'CNPC match run replay changed bytes for the same intake and roster version',
        );
      }
      return runId;
    }

    const candidatesById = new Map(
      prepared.match_pool.candidates.map((candidate) => [
        candidate.coach_id,
        candidate,
      ]),
    );
    for (const recommendation of result.recommendations) {
      const candidate = candidatesById.get(recommendation.coach_id);
      await client.query(
        `INSERT INTO business_v2.cnpc_match_candidates
           (match_run_id, coach_id, capacity_snapshot_id, rank, fit_score,
            reasons, recommendation_role)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
        [
          runId,
          recommendation.coach_id,
          candidate?.capacity_snapshot_id ?? null,
          recommendation.rank,
          recommendation.fit_score,
          JSON.stringify(recommendation.reasons),
          recommendation.recommendation_role,
        ],
      );
    }
    await client.query(
      `UPDATE business_v2.cnpc_intakes
          SET workflow_status = 'match_review',
              updated_at = now(),
              last_updated_by = 'cnpc:host'
        WHERE id = $1 AND workflow_status IN ('new', 'matching', 'match_review')`,
      [result.intake_id],
    );
    return runId;
  });
}
