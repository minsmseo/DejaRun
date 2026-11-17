import * as records from '../data/records.js';
import { matchesFilters, parseFilters } from '../engine/filter.js';
import { presentRecord } from '../services/experiments.js';
import { UserError } from '../services/errors.js';
import { action, describeSchema, presentForAgent, resolveProject, VERDICT_NOTE } from './shared.js';

const MAX_PER_GROUP = 10;

/**
 * summarize-learnings: collects what past experiments found for a system, a
 * method or a set of condition filters, split by outcome. This is the action
 * behind questions such as "has anyone cured this resin above 120 °C on aluminum?".
 */
export const summarizeLearnings = action('summarize-learnings', async (payload) => {
  const { projectId, projectKey, siteUrl, schema } = await resolveProject(payload);

  const parts = [payload.system ? `System = ${payload.system}` : '', payload.method ? `Method = ${payload.method}` : '', String(payload.filters || '')];
  const { filters, problems } = parseFilters(parts.filter(Boolean).join('; '), schema);
  if (problems.length && !filters.length) {
    throw new UserError(`${problems.join(' ')} This project's schema: ${JSON.stringify(describeSchema(schema))}`, 'invalid_filters');
  }

  const matching = (await records.listRecords(projectId)).filter((record) => matchesFilters(record, filters));
  const group = (outcome) => {
    const found = matching.filter((record) => record.outcome === outcome).sort((a, b) => String(b.performedOn || '').localeCompare(String(a.performedOn || '')));
    return { count: found.length, experiments: found.slice(0, MAX_PER_GROUP).map((record) => presentForAgent(presentRecord(record, siteUrl), schema)) };
  };

  return {
    project: projectKey,
    filtersApplied: filters.map((filter) => `${filter.name} ${filter.operator} ${filter.value}${filter.unit ? ` ${filter.unit}` : ''}`),
    filtersNotUnderstood: problems,
    totalMatching: matching.length,
    succeeded: group('success'),
    failed: group('failed'),
    inconclusive: group('inconclusive'),
    plannedOrRunning: group('planned'),
    note: `${VERDICT_NOTE} If totalMatching is 0, say that no experiment on record matches; do not infer results.`,
  };
});
