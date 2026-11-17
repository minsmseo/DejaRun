import * as jira from '../clients/jira';
import * as records from '../data/records.js';
import { presentRecord } from '../services/experiments.js';
import { UserError } from '../services/errors.js';
import { action, presentForAgent, resolveProject } from './shared.js';

/**
 * find-people-on-system: who else is planning or running experiments on the
 * same system right now. Uses DejaRun's own records and the Jira assignee;
 * it tells a researcher whom to talk to before starting similar work.
 */
export const findPeopleOnSystem = action('find-people-on-system', async (payload) => {
  const { projectId, projectKey, siteUrl, schema } = await resolveProject(payload);
  const system = String(payload.system || '').trim().toLowerCase();
  if (!system) throw new UserError(`Which system? This project uses: ${schema.systems.join(', ') || 'no fixed list of systems'}.`, 'no_system');

  const planned = (await records.listRecords(projectId)).filter(
    (record) => record.outcome === 'planned' && record.issueId && String(record.system || '').trim().toLowerCase() === system
  );
  const issues = await jira.getIssuesById(planned.map((record) => record.issueId));

  // Group the experiments that are still open in Jira by their owner.
  const byOwner = new Map();
  for (const record of planned) {
    const issue = issues[record.issueId];
    if (!issue || issue.statusCategory === 'done') continue;
    const owner = issue.assignee || 'Unassigned';
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push({ ...presentForAgent(presentRecord(record, siteUrl), schema), status: issue.status });
  }

  return {
    project: projectKey,
    system: payload.system,
    people: [...byOwner.entries()].map(([owner, experiments]) => ({ owner, plannedOrRunning: experiments })),
    note: byOwner.size
      ? 'These are planned or running experiments on this system from DejaRun records, with their Jira assignee.'
      : 'No planned or running experiment on this system is on record in this project. Say so; do not guess.',
  };
});
