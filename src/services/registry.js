import * as jira from '../clients/jira';
import { getSchema } from '../data/schema.js';
import * as records from '../data/records.js';
import { findPriorRuns } from '../engine/similarity.js';
import { DECISION_TYPES, presentRecord } from './experiments.js';

/**
 * The experiment registry of a project: every record with its latest check
 * and decision, plus the numbers a lab manager cares about.
 */
export const getRegistry = async ({ projectId, siteUrl }) => {
  const [schema, allRecords, decisions] = await Promise.all([getSchema(projectId), records.listRecords(projectId), records.listDecisions(projectId)]);

  // Owners and decision makers are looked up when shown; only account ids are stored.
  const issues = await jira.getIssuesById(allRecords.map((record) => record.issueId).filter(Boolean));
  const names = await jira.getDisplayNames(Object.values(decisions).map((decision) => decision.by));

  const rows = allRecords
    .map((record) => {
      const decision = decisions[record.id] || null;
      const issue = record.issueId ? issues[record.issueId] : null;
      return {
        ...presentRecord(record, siteUrl),
        owner: issue?.assignee || null,
        status: issue?.status || null,
        // A work item the current user cannot see is listed without a link.
        url: record.issueId && !issue ? null : presentRecord(record, siteUrl).url,
        // Computed now rather than read from the last stored check, so it reflects the current schema and records.
        verdict: schema ? findPriorRuns(schema, record, allRecords, { limit: 1 }).verdict : null,
        decision: decision && { type: decision.type, priorLabel: decision.priorLabel, priorUrl: decision.priorUrl, reason: decision.reason || '', byName: names[decision.by] || null, at: decision.at },
      };
    })
    .sort((a, b) => String(b.performedOn || b.updatedAt || '').localeCompare(String(a.performedOn || a.updatedAt || '')));

  const count = (test) => rows.filter(test).length;
  return {
    hasSchema: Boolean(schema),
    spaceKey: schema?.spaceKey || '',
    rows,
    stats: {
      total: rows.length,
      success: count((row) => row.outcome === 'success'),
      failed: count((row) => row.outcome === 'failed'),
      inconclusive: count((row) => row.outcome === 'inconclusive'),
      planned: count((row) => row.outcome === 'planned'),
      reportOnly: count((row) => !row.issueKey),
      repeatsAvoided: count((row) => row.decision?.type === DECISION_TYPES.LINKED),
      repeatsWithReason: count((row) => row.decision?.type === DECISION_TYPES.PROCEED),
      openDuplicates: count((row) => row.verdict === 'Duplicate' && !row.decision),
    },
  };
};
