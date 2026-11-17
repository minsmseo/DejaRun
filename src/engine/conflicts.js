import { STATUS } from './compare.js';
import { evaluatePair, VERDICT } from './similarity.js';

/**
 * Conflicting results: experiments that the engine judges to be the same
 * (Duplicate) but that ended differently, one a success and one a failure.
 *
 * Pure functions, no Forge APIs. This code only finds the conflict and
 * collects the recorded facts that could explain it. It does not explain
 * anything itself: the Rovo agent may offer hypotheses, each tied to one of
 * these facts and labelled as a hypothesis.
 */

/** Only outcomes that state a result can disagree. Planned and inconclusive runs are left out. */
const DECIDED = new Set(['success', 'failed']);

const timeOf = (record) => {
  const time = Date.parse(record?.performedOn || record?.createdAt || '');
  return Number.isNaN(time) ? null : time;
};

/**
 * The recorded facts about two experiments that could explain a different result.
 * - closeButNotIdentical: numeric conditions that match within tolerance but are not the same value
 * - recordedOnOneSideOnly: conditions only one of the two experiments has a value for
 * - different: conditions outside tolerance (possible when the pair is a Duplicate by score, not by every field)
 * - daysApart: days between the two runs, when both have a date
 */
export const collectEvidence = (rows, first, second) => {
  const pick = (row) => ({ condition: row.name, first: row.newValue || null, second: row.priorValue || null, why: row.note });
  const firstTime = timeOf(first);
  const secondTime = timeOf(second);
  return {
    closeButNotIdentical: rows.filter((row) => row.status === STATUS.MATCH && row.type === 'numeric' && row.difference > 1e-9).map(pick),
    recordedOnOneSideOnly: rows.filter((row) => row.status === STATUS.NOT_COMPARABLE && (row.newValue || row.priorValue)).map(pick),
    different: rows.filter((row) => row.status === STATUS.MISMATCH).map(pick),
    daysApart: firstTime === null || secondTime === null ? null : Math.round(Math.abs(firstTime - secondTime) / 86400000),
  };
};

/**
 * Finds every pair of experiments with the same conditions and opposite results.
 * In each pair `first` is the earlier run.
 *
 * @returns {Array<{ first, second, score, evidence }>} most similar pairs first
 */
export const findConflicts = (schema, records) => {
  const decided = (records || []).filter((record) => record && DECIDED.has(record.outcome));
  const conflicts = [];
  for (let i = 0; i < decided.length; i += 1) {
    for (let j = i + 1; j < decided.length; j += 1) {
      if (decided[i].outcome === decided[j].outcome) continue;
      const [first, second] = (timeOf(decided[i]) ?? 0) <= (timeOf(decided[j]) ?? 0) ? [decided[i], decided[j]] : [decided[j], decided[i]];
      const result = evaluatePair(schema, first, second);
      if (result.verdict !== VERDICT.DUPLICATE) continue;
      conflicts.push({ first, second, score: result.score, evidence: collectEvidence(result.rows, first, second) });
    }
  }
  return conflicts.sort((a, b) => b.score - a.score || String(a.first.id).localeCompare(String(b.first.id)));
};

/** The conflicts that involve one experiment or any experiment the engine judges to be its duplicate. */
export const conflictsAround = (schema, record, records) => {
  const group = (records || []).filter((candidate) => candidate && (candidate.id === record.id || evaluatePair(schema, record, candidate).verdict === VERDICT.DUPLICATE));
  return findConflicts(schema, group);
};
