import * as jira from '../clients/jira';
import { importReports } from '../services/backfill.js';
import { registerExperiment as register } from '../services/experiments.js';
import { UserError } from '../services/errors.js';
import { pageIdFrom } from './proposeRecordFromPage.js';
import { action, parseConditions, presentForAgent, presentMatchForAgent, resolveProject, VERDICT_NOTE } from './shared.js';

/**
 * register-experiment: creates or updates an experiment record.
 * - with `page`: registers the experiment described by a Confluence report page
 * - with `issueKey`: registers the conditions of a work item, then runs the check
 *
 * This writes data. The agent prompt requires showing the record and getting
 * the user's confirmation first. The action itself checks edit permission.
 */
export const registerExperiment = action('register-experiment', async (payload) => {
  const issueKey = String(payload.issueKey || '').trim().toUpperCase();
  const { projectId, projectKey, siteUrl, schema } = await resolveProject(payload, issueKey);
  const accountId = payload.context?.accountId || null;

  if (!(await jira.getMyPermissions(['EDIT_ISSUES'], { projectId })).EDIT_ISSUES) {
    throw new UserError('You do not have permission to edit work items in this project, so I cannot register experiments for you.', 'forbidden');
  }

  if (payload.page) {
    const { imported, skipped } = await importReports({ projectId, projectKey, pageIds: [pageIdFrom(payload.page)], accountId, siteUrl });
    if (!imported.length) throw new UserError(`The page was not registered. ${skipped[0]?.reason || ''}`.trim(), 'not_registered');
    return { registered: presentForAgent(imported[0], schema), from: 'Confluence report page' };
  }

  if (!issueKey) throw new UserError('Tell me which work item this experiment belongs to (for example BAF-13), or give me a Confluence report page.', 'no_issue');
  const issue = await jira.getIssue(issueKey);
  if (!issue || issue.projectId !== projectId) throw new UserError(`Work item ${issueKey} does not exist in project ${projectKey} or you cannot see it.`, 'no_issue');

  const { details, unknown } = parseConditions(payload.conditions, schema, {
    System: payload.system,
    'Test method': payload.method,
    Objective: payload.objective,
    Outcome: payload.outcome,
    Findings: payload.findings,
  });
  const { record, check } = await register({ projectId, projectKey, issue, input: details, accountId, siteUrl });
  return {
    registered: presentForAgent(record, schema),
    conditionsNotInSchema: unknown,
    priorRunCheck: check && { verdict: check.verdict, experimentsChecked: check.checked, priorRuns: check.matches.map((match) => presentMatchForAgent(match, schema)) },
    note: VERDICT_NOTE,
  };
});
