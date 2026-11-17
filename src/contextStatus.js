import { getSchema } from './data/schema.js';
import * as records from './data/records.js';
import { issueRecordId } from './domain/record.js';
import { findPriorRuns, VERDICT } from './engine/similarity.js';

/**
 * Dynamic status of the DejaRun entry in the work item's context area (the
 * fields on the right). Jira calls this for every work item, so the verdict
 * is visible as a lozenge without anyone adding or opening a panel.
 *
 * It reads only DejaRun's own storage, so it is quick and needs no Jira call.
 */

const lozenge = (label, type) => ({ status: { type: 'lozenge', value: { label, type } } });

export const contextStatus = async (payload) => {
  try {
    const issueId = payload?.extension?.issue?.id;
    const projectId = payload?.extension?.project?.id ? String(payload.extension.project.id) : null;
    if (!issueId || !projectId) return lozenge('Not registered', 'default');

    const recordId = issueRecordId(issueId);
    const [schema, allRecords, decision] = await Promise.all([getSchema(projectId), records.listRecords(projectId), records.getDecision(projectId, recordId)]);
    if (!schema) return lozenge('Not set up', 'default');

    const record = allRecords.find((candidate) => candidate.id === recordId);
    if (!record) return lozenge('Not registered', 'default');
    if (decision) return lozenge(decision.type === 'linked_repeat' ? 'Repeat, not run' : 'Reason on record', 'new');

    const { verdict } = findPriorRuns(schema, record, allRecords, { limit: 1 });
    if (verdict === VERDICT.DUPLICATE) return lozenge('Duplicate', 'removed');
    if (verdict === VERDICT.SIMILAR) return lozenge('Similar', 'moved');
    return lozenge('No prior run', 'success');
  } catch (error) {
    console.error(`Context status failed: ${error.message}`);
    return lozenge('Unavailable', 'default');
  }
};
