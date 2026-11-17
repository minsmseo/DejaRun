import * as jira from './clients/jira';
import { extractDetails, looksLikeExperiment, tablesFromAdf } from './backfill/parseTable.js';
import { getSchema } from './data/schema.js';
import * as records from './data/records.js';
import { issueRecordId } from './domain/record.js';
import { UserError } from './services/errors.js';
import { checkRecord, registerExperiment } from './services/experiments.js';

/**
 * Issue event trigger.
 *
 * Conditions are usually saved from the issue panel, and that save already
 * runs the check. This trigger covers what happens outside the panel:
 * - a work item is created with a conditions table in its description:
 *   the conditions are registered and checked without anyone opening the panel
 * - a work item is edited: keep the record's title in step with the summary
 *   and run the check again, so a Duplicate is still reported to the assignee
 * - a work item is deleted: remove its experiment record, so it no longer
 *   shows up as a prior run
 *
 * There is no user here, so Jira is called as the app. Events caused by the
 * app's own comments and links are filtered out in the manifest (ignoreSelf).
 */

/** Registers a new work item whose description has a conditions table that matches the project's schema. */
const registerFromDescription = async (issueId, projectId) => {
  const schema = await getSchema(projectId);
  if (!schema) return;
  const issue = await jira.getIssue(issueId, { as: 'app', withDescription: true });
  if (!issue?.description) return;

  const extraction = extractDetails(tablesFromAdf(issue.description), schema);
  if (!looksLikeExperiment(extraction)) return;

  const siteUrl = await jira.getSiteUrl({ as: 'app' });
  try {
    await registerExperiment({ projectId, projectKey: issue.projectKey, issue, input: extraction.details, accountId: issue.reporterId, siteUrl, as: 'app' });
  } catch (error) {
    // An incomplete table (for example no test method) is not an error: the researcher can finish it in the panel.
    if (!(error instanceof UserError)) throw error;
  }
};

export const onIssueEvent = async (event) => {
  const issue = event?.issue;
  const projectId = issue?.fields?.project?.id ? String(issue.fields.project.id) : null;
  if (!issue?.id || !projectId) return;

  const recordId = issueRecordId(issue.id);
  const record = await records.getRecord(projectId, recordId);

  if (event.eventType === 'avi:jira:created:issue') {
    if (!record) await registerFromDescription(issue.id, projectId);
    return;
  }
  if (!record) return;

  if (event.eventType === 'avi:jira:deleted:issue') {
    await records.deleteRecord(projectId, recordId);
    return;
  }

  const summary = issue.fields?.summary;
  if (summary && summary !== record.title) {
    await records.saveRecord({ ...record, title: summary, issueKey: issue.key || record.issueKey }, record.updatedBy);
  }
  const siteUrl = await jira.getSiteUrl({ as: 'app' });
  await checkRecord({ projectId, recordId, siteUrl, notify: true, as: 'app' });
};
