import * as records from '../data/records.js';
import { sanitizeDetails } from '../domain/record.js';
import { comparePriorRuns } from '../services/experiments.js';
import { UserError } from '../services/errors.js';
import { action, describeSchema, parseConditions, presentMatchForAgent, resolveProject, VERDICT_NOTE } from './shared.js';

/**
 * find-prior-runs: checks planned conditions against every experiment on
 * record in the project and returns the verdict with the comparison.
 * Nothing is stored; this answers "has this been done before?".
 */
export const findPriorRuns = action('find-prior-runs', async (payload) => {
  const { projectId, projectKey, siteUrl, schema } = await resolveProject(payload);
  const { details: raw, unknown } = parseConditions(payload.conditions, schema, { System: payload.system, 'Test method': payload.method });
  const { details } = sanitizeDetails(raw, schema);

  if (!details.system && !details.method && Object.keys(details.parameters).length === 0) {
    throw new UserError(
      `I need at least a system, a method or one condition to compare. This project's schema: ${JSON.stringify(describeSchema(schema))}`,
      'no_conditions'
    );
  }

  const allRecords = await records.listRecords(projectId);
  const result = comparePriorRuns({ schema, details, allRecords, siteUrl });
  return {
    project: projectKey,
    verdict: result.verdict,
    experimentsChecked: result.checked,
    conditionsUsed: { system: details.system || null, method: details.method || null, parameters: details.parameters },
    conditionsNotInSchema: unknown,
    priorRuns: result.matches.map((match) => presentMatchForAgent(match, schema)),
    note: VERDICT_NOTE,
  };
});
