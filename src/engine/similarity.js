import { buildComparison, STATUS } from './compare.js';

/**
 * Similarity score and verdict for experiment records.
 *
 * Pure functions, no Forge APIs. The verdict is deterministic: the same
 * schema and the same two records always give the same result. The Rovo
 * agent explains verdicts but never changes them.
 */

export const VERDICT = { DUPLICATE: 'Duplicate', SIMILAR: 'Similar', NEW: 'New' };

/**
 * Defaults used when a project has not set its own thresholds.
 * - duplicate / similar: score thresholds between 0 and 1
 * - minCoverage: share of the total weight that must be comparable before a
 *   pair may be called Duplicate. It stops two records that share only one
 *   or two filled-in fields from being reported as the same experiment.
 */
export const DEFAULT_THRESHOLDS = { duplicate: 0.95, similar: 0.6, minCoverage: 0.6 };

const clamp01 = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
};

/** Fills in missing thresholds and keeps similar <= duplicate. */
export const resolveThresholds = (thresholds) => {
  const duplicate = clamp01(thresholds?.duplicate, DEFAULT_THRESHOLDS.duplicate);
  const similar = Math.min(clamp01(thresholds?.similar, DEFAULT_THRESHOLDS.similar), duplicate);
  const minCoverage = clamp01(thresholds?.minCoverage, DEFAULT_THRESHOLDS.minCoverage);
  return { duplicate, similar, minCoverage };
};

/**
 * Weighted share of matching fields among the comparable ones.
 * Fields marked "not comparable" are left out of both numerator and denominator.
 *
 * @returns {{ score: number|null, coverage: number, matched, mismatched, notComparable }}
 *   score is null when nothing could be compared.
 *   coverage is comparable weight divided by total weight (0 to 1).
 */
export const scoreRows = (rows) => {
  let matchedWeight = 0;
  let comparableWeight = 0;
  let totalWeight = 0;
  const counts = { matched: 0, mismatched: 0, notComparable: 0 };

  for (const row of rows) {
    totalWeight += row.weight;
    if (row.status === STATUS.NOT_COMPARABLE) {
      counts.notComparable += 1;
      continue;
    }
    comparableWeight += row.weight;
    if (row.status === STATUS.MATCH) {
      matchedWeight += row.weight;
      counts.matched += 1;
    } else {
      counts.mismatched += 1;
    }
  }

  return {
    score: comparableWeight > 0 ? matchedWeight / comparableWeight : null,
    coverage: totalWeight > 0 ? comparableWeight / totalWeight : 0,
    ...counts,
  };
};

/**
 * Turns a score into a verdict.
 * A score at or above the duplicate threshold is only Duplicate when enough
 * of the schema could be compared; otherwise it is reported as Similar.
 */
export const verdictFor = (score, coverage, thresholds) => {
  const limits = resolveThresholds(thresholds);
  if (score === null) return VERDICT.NEW;
  if (score >= limits.duplicate) return coverage >= limits.minCoverage ? VERDICT.DUPLICATE : VERDICT.SIMILAR;
  if (score >= limits.similar) return VERDICT.SIMILAR;
  return VERDICT.NEW;
};

/**
 * Compares a new record with one prior record.
 * @returns {{ score, coverage, verdict, lowCoverage, matched, mismatched, notComparable, rows }}
 */
export const evaluatePair = (schema, newRecord, priorRecord) => {
  const rows = buildComparison(schema, newRecord, priorRecord);
  const summary = scoreRows(rows);
  const limits = resolveThresholds(schema?.thresholds);
  const verdict = verdictFor(summary.score, summary.coverage, limits);
  return {
    ...summary,
    verdict,
    // True when the score alone would say Duplicate but too little could be compared.
    lowCoverage: summary.score !== null && summary.score >= limits.duplicate && summary.coverage < limits.minCoverage,
    rows,
  };
};

/** When an experiment happened: its run date, or the time it was recorded if it has not been run yet. */
const timeOf = (record) => {
  const time = Date.parse(record?.performedOn || record?.createdAt || '');
  return Number.isNaN(time) ? null : time;
};

/**
 * A prior run is an experiment that happened, or was recorded, no later than
 * the one being checked. Without this, an experiment from last year would be
 * reported as a duplicate of the reproduction someone planned yesterday.
 * Records without any date (for example a what-if question) are compared with everything.
 */
export const isPriorTo = (candidate, record) => {
  const candidateTime = timeOf(candidate);
  const recordTime = timeOf(record);
  return candidateTime === null || recordTime === null || candidateTime <= recordTime;
};

const VERDICT_RANK = { [VERDICT.DUPLICATE]: 2, [VERDICT.SIMILAR]: 1, [VERDICT.NEW]: 0 };

/**
 * Checks a new record against a list of prior records.
 *
 * @param {object} schema the project's parameter schema
 * @param {object} newRecord the record being checked (may carry an id)
 * @param {Array<object>} candidates records of the project, each with an id; only those that are
 *   prior to the new record (see isPriorTo) are compared
 * @param {{ limit?: number }} options maximum number of matches to return
 * @returns {{ verdict, matches: Array<{ record, score, coverage, verdict, rows, ... }>, checked: number }}
 *   verdict is the strongest verdict among the matches. matches holds only
 *   Duplicate and Similar results, best first.
 */
export const findPriorRuns = (schema, newRecord, candidates, { limit = 5 } = {}) => {
  const others = (candidates || []).filter((candidate) => candidate && candidate.id !== newRecord?.id && isPriorTo(candidate, newRecord));
  const matches = others
    .map((record) => ({ record, ...evaluatePair(schema, newRecord, record) }))
    .filter((match) => match.verdict !== VERDICT.NEW)
    .sort(
      (a, b) =>
        VERDICT_RANK[b.verdict] - VERDICT_RANK[a.verdict] ||
        b.score - a.score ||
        b.coverage - a.coverage ||
        String(a.record.id).localeCompare(String(b.record.id))
    )
    .slice(0, limit);

  return {
    verdict: matches.length ? matches[0].verdict : VERDICT.NEW,
    matches,
    checked: others.length,
  };
};
