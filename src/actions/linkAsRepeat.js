import * as jira from '../clients/jira';
import * as records from '../data/records.js';
import { linkAsRepeat as link } from '../services/experiments.js';
import { UserError } from '../services/errors.js';
import { action, requireRecord, resolveProject } from './shared.js';

/**
 * link-as-repeat: records that an experiment repeats a prior run and will
 * not be run again, and links the two work items.
 *
 * This writes data. The agent prompt requires naming both experiments and
 * getting the user's confirmation first. The action itself checks edit permission.
 */
export const linkAsRepeat = action('link-as-repeat', async (payload) => {
  const { projectId, siteUrl } = await resolveProject(payload, payload.experiment);
  if (!(await jira.getMyPermissions(['EDIT_ISSUES'], { projectId })).EDIT_ISSUES) {
    throw new UserError('You do not have permission to edit work items in this project, so I cannot record this decision for you.', 'forbidden');
  }

  const [record, prior] = await Promise.all([requireRecord(projectId, payload.experiment), requireRecord(projectId, payload.priorRun, 'prior run')]);
  if (!record.issueKey) throw new UserError('Only an experiment that has a Jira work item can be linked as a repeat.', 'no_issue');
  const existing = await records.getDecision(projectId, record.id);
  if (existing) throw new UserError(`${record.issueKey} already has a decision (${existing.type === 'linked_repeat' ? 'linked as repeat' : 'proceeding with reason'}). Change it in the DejaRun panel of the work item.`, 'has_decision');

  const decision = await link({ projectId, recordId: record.id, priorRecordId: prior.id, accountId: payload.context?.accountId || null, siteUrl });
  return {
    done: `${record.issueKey} is recorded as a repeat of ${decision.priorLabel} and will not be run again.`,
    workItemsLinked: decision.linked,
    experimentUrl: `${siteUrl}/browse/${record.issueKey}`,
    priorRunUrl: decision.priorUrl,
  };
});
