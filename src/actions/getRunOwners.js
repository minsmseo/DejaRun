import api from '@forge/api';
import * as jira from '../clients/jira';
import { getRunContext } from '../clients/twg.js';
import { presentRecord } from '../services/experiments.js';
import { action, presentForAgent, requireRecord, resolveProject } from './shared.js';

/** Teamwork Graph can only be called as the current user; this is the backend way to do that. */
const graphRequest = async (query, variables) => {
  const response = await api.asUser().requestTeamworkGraph(query, variables);
  return response.json();
};

/**
 * get-run-owners: who can tell the user about a past experiment.
 * The owner comes from Jira. The Teamwork Graph adds who wrote the report
 * page and what each of those people is working on now. If the graph cannot
 * be read, the Jira owner is still returned.
 */
export const getRunOwners = action('get-run-owners', async (payload) => {
  const { projectId, siteUrl, schema } = await resolveProject(payload, payload.experiment);
  const record = await requireRecord(projectId, payload.experiment);
  const issue = record.issueKey ? await jira.getIssue(record.issueKey) : null;

  const context = await getRunContext(graphRequest, {
    cloudId: payload.context?.cloudId,
    ownerId: issue?.assigneeId || null,
    ownerName: issue?.assignee || null,
    reportPageId: record.report?.pageId || null,
  });

  return {
    experiment: presentForAgent(presentRecord(record, siteUrl), schema),
    people: context.people.map((person) => ({
      name: person.name || 'Name not available',
      roles: person.roles,
      openWorkItems: person.openWork ? person.openWork.items.map((item) => ({ key: item.key, summary: item.summary, status: item.status, url: item.url })) : 'Could not be read from the Teamwork Graph.',
      hasMoreOpenWork: person.openWork ? person.openWork.more : null,
    })),
    pagesLinkedFromReport: context.linkedPages,
    teamworkGraphAvailable: context.available,
    note: context.people.length
      ? 'People come from the Jira assignee and from the Teamwork Graph (report creator and contributors). Name only people listed here.'
      : 'No owner or report author is on record for this experiment. Say so; do not guess a person.',
  };
});
