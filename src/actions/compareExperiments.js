import { evaluatePair } from '../engine/similarity.js';
import { presentRecord } from '../services/experiments.js';
import { action, presentForAgent, requireRecord, resolveProject, VERDICT_NOTE } from './shared.js';

/**
 * compare-experiments: field-by-field differences between two experiments
 * of the same project.
 */
export const compareExperiments = action('compare-experiments', async (payload) => {
  const { projectId, siteUrl, schema } = await resolveProject(payload, payload.first);
  const [first, second] = await Promise.all([requireRecord(projectId, payload.first), requireRecord(projectId, payload.second)]);

  const result = evaluatePair(schema, first, second);
  return {
    first: presentForAgent(presentRecord(first, siteUrl), schema),
    second: presentForAgent(presentRecord(second, siteUrl), schema),
    similarityPercent: result.score === null ? null : Math.round(result.score * 100),
    verdict: result.verdict,
    differences: result.rows.filter((row) => row.status === 'mismatch').map((row) => ({ condition: row.name, first: row.newValue, second: row.priorValue, why: row.note })),
    same: result.rows.filter((row) => row.status === 'match').map((row) => row.name),
    notComparable: result.rows.filter((row) => row.status === 'not_comparable').map((row) => ({ condition: row.name, first: row.newValue || null, second: row.priorValue || null })),
    note: VERDICT_NOTE,
  };
});
