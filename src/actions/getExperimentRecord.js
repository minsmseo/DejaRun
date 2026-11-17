import * as records from '../data/records.js';
import { checkRecord, presentRecord } from '../services/experiments.js';
import { action, presentForAgent, presentMatchForAgent, requireRecord, resolveProject, VERDICT_NOTE } from './shared.js';

/**
 * get-experiment-record: returns the experiment record of one work item (or
 * imported report) with its current prior-run check and the decision taken.
 */
export const getExperimentRecord = action('get-experiment-record', async (payload) => {
  const reference = payload.experiment || payload.context?.jira?.issueKey;
  const { projectId, siteUrl, schema } = await resolveProject(payload, reference);
  const record = await requireRecord(projectId, reference);

  const [check, decision] = await Promise.all([checkRecord({ projectId, recordId: record.id, siteUrl }), records.getDecision(projectId, record.id)]);
  return {
    experiment: presentForAgent(presentRecord(record, siteUrl), schema),
    objective: record.objective || null,
    priorRunCheck: check && { verdict: check.verdict, experimentsChecked: check.checked, priorRuns: check.matches.map((match) => presentMatchForAgent(match, schema)) },
    decision: decision
      ? { type: decision.type === 'linked_repeat' ? 'Linked as repeat, not run again' : 'Proceeding with reason', priorRun: decision.priorLabel, reason: decision.reason || null, decidedOn: decision.at }
      : 'No decision recorded.',
    note: VERDICT_NOTE,
  };
});
