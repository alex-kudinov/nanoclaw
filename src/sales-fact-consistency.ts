import fs from 'node:fs';
import path from 'node:path';

import { buildApprovedHandoff } from './approved-send-handoff.js';

export const SALES_SCHEDULE_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export type ScheduleProgramId =
  | 'acc'
  | 'pcc'
  | 'actc'
  | 'mentor'
  | 'mcs-practicum'
  | 'supervision';

interface ProgramDefinition {
  id: ScheduleProgramId;
  heading: RegExp;
  explicitContext: RegExp;
  claimContext: RegExp;
}

const PROGRAMS: readonly ProgramDefinition[] = [
  {
    id: 'supervision',
    heading: /^Coaching Supervision Mastery\b/i,
    explicitContext:
      /\b(?:Coaching Supervision Mastery|coaching supervisor training)\b/i,
    claimContext:
      /\b(?:Coaching Supervision Mastery|coaching supervisor training|supervisor training|AACS)\b/i,
  },
  {
    id: 'mcs-practicum',
    heading: /^MCS\s+—\s+Mentor Coach Training\b/i,
    explicitContext:
      /\b(?:Mentor Coach Training|MCS Standard Path|MCS Practicum)\b/i,
    claimContext:
      /\b(?:Mentor Coach Training|MCS Standard Path|MCS Practicum|MCS)\b/i,
  },
  {
    id: 'mentor',
    heading: /^ICF Mentor Coaching\b/i,
    explicitContext: /\b(?:ICF Mentor Coaching|Group Mentor Coaching)\b/i,
    claimContext: /\b(?:ICF Mentor Coaching|Group Mentor Coaching)\b/i,
  },
  {
    id: 'acc',
    heading: /^ACC\s+—\s+Associate Certified Coach\b/i,
    explicitContext: /\bACC (?:Certification|Coach Certification|Level 1)\b/i,
    claimContext: /\bACC\b/i,
  },
  {
    id: 'pcc',
    heading: /^PCC\s+—\s+Professional Certified Coach\b/i,
    explicitContext: /\bPCC (?:Certification|Coach Certification|Level 2)\b/i,
    claimContext: /\bPCC\b/i,
  },
  {
    id: 'actc',
    heading: /^ACTC\s+—\s+Advanced Certified Team Coach\b/i,
    explicitContext: /\bACTC (?:Certification|Team Coaching Training)\b/i,
    claimContext: /\bACTC\b/i,
  },
];

const MONTHS: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const DATE_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/gi;

export interface ProgramSchedule {
  id: ScheduleProgramId;
  heading: string;
  dates: string[];
}

export interface SalesFactConsistencyIssue {
  code:
    | 'schedule_unavailable'
    | 'schedule_stale'
    | 'schedule_program_missing'
    | 'schedule_claim_ambiguous'
    | 'schedule_contradiction'
    | 'schedule_date_unsupported'
    | 'catalog_unavailable'
    | 'price_contradiction';
  detail: string;
}

export interface SalesFactConsistencyResult {
  ok: boolean;
  issues: SalesFactConsistencyIssue[];
}

interface CoachingSupervisionCatalog {
  catalog_id?: unknown;
  current_enrollment?: {
    start?: unknown;
    end?: unknown;
    price_cents?: unknown;
  };
  regular_tuition?: { price_cents?: unknown };
}

export interface SalesFactConsistencyOptions {
  now?: Date;
  schedulePath?: string;
  scheduleMarkdown?: string | null;
  scheduleMtimeMs?: number;
  maxScheduleAgeMs?: number;
  coachingSupervisionCatalogPath?: string;
  coachingSupervisionCatalogSource?: string | null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const value = new Date(Date.UTC(year, month, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month ||
    value.getUTCDate() !== day
  )
    return null;
  return value.toISOString().slice(0, 10);
}

function datesIn(text: string): string[] {
  const dates = new Set<string>();
  for (const match of text.matchAll(DATE_RE)) {
    const date = isoDate(
      Number(match[3]),
      MONTHS[match[1].toLowerCase()],
      Number(match[2]),
    );
    if (date) dates.add(date);
  }
  return [...dates].sort();
}

function definitionForHeading(heading: string): ProgramDefinition | undefined {
  return PROGRAMS.find((program) => program.heading.test(heading));
}

/** Parse only the generated program sections; prose elsewhere is not authority. */
export function parseSalesSchedule(markdown: string): ProgramSchedule[] {
  if (!/Auto-generated from the program calendars every day/i.test(markdown))
    return [];
  const sections = markdown.split(/^##\s+/m).slice(1);
  const schedules: ProgramSchedule[] = [];
  for (const section of sections) {
    const newline = section.indexOf('\n');
    const heading = (
      newline === -1 ? section : section.slice(0, newline)
    ).trim();
    const definition = definitionForHeading(heading);
    if (!definition) continue;
    schedules.push({
      id: definition.id,
      heading,
      dates: datesIn(newline === -1 ? '' : section.slice(newline + 1)),
    });
  }
  return schedules;
}

function headerBeforeDraft(cardText: string): string {
  return cardText.split(
    /^\s*DRAFT (?:RESPONSE(?: TO LEAD)?|FOLLOW-UP):\s*$/im,
  )[0];
}

function claimText(cardText: string, body: string): string {
  const header = headerBeforeDraft(cardText);
  const sections = header
    .split(/\r?\n/)
    .map((line) =>
      /^\s*(?:ANSWERABLE|ABSTAINED)\s*:\s*(.+)$/i.exec(line)?.[1].trim(),
    )
    .filter((line): line is string => Boolean(line));
  return [...sections, body].filter(Boolean).join('\n');
}

export function resolveSalesSchedulePrograms(
  cardText: string,
  subject: string,
): ScheduleProgramId[] {
  const header = headerBeforeDraft(cardText);
  const programMatch = header
    .split(/\r?\n/)
    .filter((line) => /^\s*PROGRAM MATCH\s*:/i.test(line))
    .join('\n');
  const contexts = [programMatch, subject].filter(Boolean);
  if (contexts.length === 0) return [];
  return PROGRAMS.filter((program) =>
    contexts.some((context) => program.explicitContext.test(context)),
  ).map((program) => program.id);
}

export function isSalesScheduleDependent(
  cardText: string,
  body: string,
): boolean {
  const header = headerBeforeDraft(cardText);
  return (
    /^\s*Category\s*:\s*scheduling\s*$/im.test(header) ||
    /\b(?:future|next|later|subsequent|upcoming)\s+(?:cohort|class|start)/i.test(
      `${header}\n${body}`,
    ) ||
    /\b(?:cohort|class)\s+(?:date|schedule|start|begin)/i.test(
      `${header}\n${body}`,
    )
  );
}

function scheduleDenialSentences(body: string): string[] {
  const patterns = [
    /\b(?:20\d{2}\s+)?(?:cohort\s+)?(?:dates?|schedule)\b[^.!?\n]{0,100}\b(?:haven't|hasn't|have not|has not|aren't|are not|not been|not yet|unannounced|not announced|unknown|unavailable|not scheduled)\b/i,
    /\b(?:no|without)\s+(?:announced|published|scheduled|confirmed)?\s*(?:future|20\d{2})?\s*(?:cohort\s+)?(?:dates?|schedule)\b/i,
    /\b(?:future|20\d{2})\s+(?:cohorts?|classes?)\b[^.!?\n]{0,100}\b(?:not scheduled|not announced|unknown|unavailable)\b/i,
  ];
  return body
    .split(/[.!?\n]+/)
    .filter((sentence) => patterns.some((pattern) => pattern.test(sentence)));
}

function priceDenialSentences(body: string): string[] {
  const pattern =
    /\b(?:pricing|prices?|tuition)\b[^.!?\n]{0,100}\b(?:haven't|hasn't|have not|has not|aren't|are not|not been|not yet|unannounced|not announced|unknown|unavailable)\b/i;
  return body.split(/[.!?\n]+/).filter((sentence) => pattern.test(sentence));
}

function denialContradictsDates(
  denialSentence: string,
  publishedDates: readonly string[],
): boolean {
  const years = new Set(
    [...denialSentence.matchAll(/\b(20\d{2})\b/g)].map((match) => match[1]),
  );
  return years.size === 0
    ? publishedDates.length > 0
    : publishedDates.some((date) => years.has(date.slice(0, 4)));
}

interface ScheduleClaim {
  sentence: string;
  dates: string[];
}

function scheduleClaims(body: string): ScheduleClaim[] {
  const claims: ScheduleClaim[] = [];
  for (const sentence of body.split(/[.!?\n]+/)) {
    if (
      !/\b(?:cohort|start|starts|starting|begin|begins|beginning|next ones?|future)\b/i.test(
        sentence,
      )
    )
      continue;
    const dates = datesIn(sentence);
    if (dates.length > 0) claims.push({ sentence, dates });
  }
  return claims;
}

function programsForClaim(
  sentence: string,
  resolved: readonly ScheduleProgramId[],
): ScheduleProgramId[] {
  const explicit = PROGRAMS.filter(
    (program) =>
      resolved.includes(program.id) && program.claimContext.test(sentence),
  ).map((program) => program.id);
  if (explicit.length > 0) return explicit;
  return resolved.length === 1 ? [resolved[0]] : [];
}

function defaultSchedulePath(): string {
  return path.join(
    process.cwd(),
    'knowledge',
    'agents',
    'sales',
    'SCHEDULE.md',
  );
}

function defaultCoachingSupervisionCatalogPath(): string {
  const codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd();
  return path.join(
    codeRoot,
    'facts',
    'catalogs',
    'coaching-supervision-mastery.json',
  );
}

function readSchedule(options: SalesFactConsistencyOptions): {
  markdown: string | null;
  mtimeMs?: number;
} {
  if (Object.hasOwn(options, 'scheduleMarkdown')) {
    return {
      markdown: options.scheduleMarkdown ?? null,
      mtimeMs: options.scheduleMtimeMs,
    };
  }
  const schedulePath = options.schedulePath ?? defaultSchedulePath();
  try {
    return {
      markdown: fs.readFileSync(schedulePath, 'utf8'),
      mtimeMs: fs.statSync(schedulePath).mtimeMs,
    };
  } catch {
    return { markdown: null };
  }
}

function readCoachingSupervisionCatalog(
  options: SalesFactConsistencyOptions,
): CoachingSupervisionCatalog | null {
  let source: string;
  if (Object.hasOwn(options, 'coachingSupervisionCatalogSource')) {
    if (options.coachingSupervisionCatalogSource === null) return null;
    source = options.coachingSupervisionCatalogSource ?? '';
  } else {
    try {
      source = fs.readFileSync(
        options.coachingSupervisionCatalogPath ??
          defaultCoachingSupervisionCatalogPath(),
        'utf8',
      );
    } catch {
      return null;
    }
  }
  try {
    const parsed = JSON.parse(source) as CoachingSupervisionCatalog;
    if (parsed.catalog_id !== 'coaching-supervision-mastery') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Host-owned pre-approval check for facts that can be compared without an LLM.
 * It deliberately rejects only direct contradictions and unsupported explicit
 * cohort dates; policy and fit claims remain outside this deterministic scope.
 */
export function checkSalesFactConsistency(
  cardText: string,
  options: SalesFactConsistencyOptions = {},
): SalesFactConsistencyResult {
  const approved = buildApprovedHandoff(cardText);
  if (!approved) return { ok: true, issues: [] };
  const programIds = resolveSalesSchedulePrograms(cardText, approved.subject);
  const scheduleDependent = isSalesScheduleDependent(cardText, approved.body);
  if (!scheduleDependent || programIds.length === 0)
    return { ok: true, issues: [] };

  const issues: SalesFactConsistencyIssue[] = [];
  const assertedFacts = claimText(cardText, approved.body);
  const now = options.now ?? new Date();
  const scheduleSource = readSchedule(options);
  if (!scheduleSource.markdown) {
    return {
      ok: false,
      issues: [
        {
          code: 'schedule_unavailable',
          detail:
            'the operational Sales schedule is unavailable for a schedule-dependent draft',
        },
      ],
    };
  }
  if (
    scheduleSource.mtimeMs !== undefined &&
    now.getTime() - scheduleSource.mtimeMs >
      (options.maxScheduleAgeMs ?? SALES_SCHEDULE_MAX_AGE_MS)
  ) {
    issues.push({
      code: 'schedule_stale',
      detail:
        'the operational Sales schedule is too old for a schedule-dependent draft',
    });
  }

  const schedules = parseSalesSchedule(scheduleSource.markdown);
  const matchedSchedules = programIds
    .map((id) => schedules.find((schedule) => schedule.id === id))
    .filter((schedule): schedule is ProgramSchedule => Boolean(schedule));
  for (const id of programIds) {
    if (!matchedSchedules.some((schedule) => schedule.id === id)) {
      issues.push({
        code: 'schedule_program_missing',
        detail: `the operational Sales schedule has no generated section for ${id}`,
      });
    }
  }

  const publishedDatesByProgram = new Map<ScheduleProgramId, Set<string>>(
    matchedSchedules.map((schedule) => [schedule.id, new Set(schedule.dates)]),
  );
  const futureDates = (id: ScheduleProgramId): string[] =>
    [...(publishedDatesByProgram.get(id) ?? [])].filter(
      (date) => Date.parse(`${date}T23:59:59Z`) >= now.getTime(),
    );
  let ambiguousClaimRecorded = false;
  const recordAmbiguousClaim = (): void => {
    if (ambiguousClaimRecorded) return;
    ambiguousClaimRecorded = true;
    issues.push({
      code: 'schedule_claim_ambiguous',
      detail:
        'a multi-program schedule claim does not identify which program it describes',
    });
  };
  for (const sentence of scheduleDenialSentences(assertedFacts)) {
    const targets = programsForClaim(sentence, programIds);
    if (targets.length === 0) {
      recordAmbiguousClaim();
      continue;
    }
    if (
      targets.some((id) => denialContradictsDates(sentence, futureDates(id)))
    ) {
      issues.push({
        code: 'schedule_contradiction',
        detail:
          'the draft says dates or scheduling are unavailable although that program schedule contains future cohorts',
      });
    }
  }

  const supervisionSelected = programIds.includes('supervision');
  let supervisionCatalog: CoachingSupervisionCatalog | null = null;
  if (supervisionSelected) {
    supervisionCatalog = readCoachingSupervisionCatalog(options);
    const priceClaims = assertedFacts
      .split(/[.!?\n]+/)
      .filter((sentence) =>
        /\b(?:price|pricing|tuition|rate)\b|\$\s*\d/i.test(sentence),
      );
    const supervisionPriceClaims = priceClaims.filter((sentence) =>
      programsForClaim(sentence, programIds).includes('supervision'),
    );
    if (
      programIds.length > 1 &&
      priceDenialSentences(assertedFacts).some(
        (sentence) => programsForClaim(sentence, programIds).length === 0,
      )
    )
      recordAmbiguousClaim();
    const priceDependent = supervisionPriceClaims.length > 0;
    if (priceDependent && !supervisionCatalog) {
      issues.push({
        code: 'catalog_unavailable',
        detail:
          'the canonical Coaching Supervision Mastery catalog is unavailable for a price-dependent draft',
      });
    } else if (
      supervisionCatalog &&
      typeof supervisionCatalog.regular_tuition?.price_cents === 'number' &&
      priceDenialSentences(assertedFacts).some(
        (sentence) =>
          programsForClaim(sentence, programIds).includes('supervision') &&
          denialContradictsDates(sentence, futureDates('supervision')),
      )
    ) {
      issues.push({
        code: 'price_contradiction',
        detail:
          'the draft says pricing is unavailable although canonical regular tuition is published',
      });
    }
    for (const value of [
      supervisionCatalog?.current_enrollment?.start,
      supervisionCatalog?.current_enrollment?.end,
    ]) {
      if (typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value))
        publishedDatesByProgram.get('supervision')?.add(value);
    }
  }

  for (const claim of scheduleClaims(assertedFacts)) {
    const targets = programsForClaim(claim.sentence, programIds);
    if (targets.length === 0) {
      recordAmbiguousClaim();
      continue;
    }
    for (const id of targets) {
      for (const date of claim.dates) {
        if (!publishedDatesByProgram.get(id)?.has(date)) {
          issues.push({
            code: 'schedule_date_unsupported',
            detail: `the draft names unsupported ${id} cohort/start date ${date}`,
          });
        }
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

export function salesFactConsistencyIssue(
  cardText: string,
  options: SalesFactConsistencyOptions = {},
): string | undefined {
  const result = checkSalesFactConsistency(cardText, options);
  return result.ok
    ? undefined
    : result.issues.map((issue) => issue.detail).join('; ');
}
