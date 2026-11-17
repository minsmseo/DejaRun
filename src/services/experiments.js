import * as jira from '../clients/jira';
import { getSchema } from '../data/schema.js';
import * as records from '../data/records.js';
import { issueRecordId, sanitizeDetails, SOURCES } from '../domain/record.js';
import { findPriorRuns, VERDICT } from '../engine/similarity.js';
import { UserError } from './errors.js';
import { duplicateComment, decisionComment } from './comments.js';

/**
 * Experiment records, the duplicate check and decisions.
 *
 * This is the one place that ties storage, the similarity engine and Jira
 * together. The UI resolvers, the issue event trigger and the Rovo agent
 * actions all go through these functions, so they always agree.
 */

const MAX_MATCHES = 5;

/** Where a record can be opened: its work item, or its report page for report-only experiments. */
const recordUrl = (record, siteUrl) => (record.issueKey ? `${siteUrl}/browse/${record.issueKey}` : record.report?.url || null);

/** The fields of a record that are shown to people and to the agent. */
export const presentRecord = (record, siteUrl) => ({
  recordId: record.id,
  issueKey: record.issueKey || null,
  issueId: record.issueId || null,
  title: record.title || record.issueKey || 'Untitled experiment',
  url: recordUrl(record, siteUrl),
  objective: record.objective || '',
  objectiveTag: record.objectiveTag || '',
  system: record.system,
  method: record.method,
  parameters: record.parameters || {},
  outcome: record.outcome,
  findings: record.findings || '',
  performedOn: record.performedOn || '',
  report: record.report?.url ? record.report : null,
  source: record.source,
  updatedAt: record.updatedAt,
});

const presentMatch = (match, siteUrl) => ({
  ...presentRecord(match.record, siteUrl),
  score: match.score,
  coverage: match.coverage,
  verdict: match.verdict,
  lowCoverage: match.lowCoverage,
  matched: match.matched,
  mismatched: match.mismatched,
  notComparable: match.notComparable,
  rows: match.rows,
});

/**
 * Compares one set of experiment details with every record of the project.
 * Does not store anything; used for "what if" questions from the agent too.
 */
export const comparePriorRuns = ({ schema, details, allRecords, siteUrl, excludeId, limit = MAX_MATCHES }) => {
  const result = findPriorRuns(schema, { ...details, id: excludeId }, allRecords, { limit });
  return { verdict: result.verdict, checked: result.checked, matches: result.matches.map((match) => presentMatch(match, siteUrl)) };
};

/**
 * Runs the duplicate check for a saved record and stores the outcome.
 *
 * When `notify` is set and the verdict is Duplicate, a comment is added to
 * the work item, but only once per prior run: the stored check remembers
 * which prior run the assignee was last told about. No comment is added
 * once a decision exists, because the researcher has already dealt with it.
 *
 * @returns {null | { verdict, checked, matches }} null when the project has no schema or the record is gone.
 */
export const checkRecord = async ({ projectId, recordId, siteUrl, notify = false, as = 'user' }) => {
  const [schema, allRecords] = await Promise.all([getSchema(projectId), records.listRecords(projectId)]);
  const record = allRecords.find((candidate) => candidate.id === recordId);
  if (!schema || !record) return null;

  const result = comparePriorRuns({ schema, details: record, allRecords, siteUrl, excludeId: record.id });
  const [previous, decision] = await Promise.all([records.getCheck(projectId, recordId), records.getDecision(projectId, recordId)]);
  const top = result.matches[0] || null;

  let notified = previous?.notified || null;
  if (notify && result.verdict === VERDICT.DUPLICATE && record.issueKey && !decision && notified?.recordId !== top.recordId) {
    try {
      // The notification is the app speaking, not the person who happened to save the record.
      const issue = await jira.getIssue(record.issueKey, { as: 'app' });
      await jira.addComment(record.issueKey, duplicateComment({ match: top, assigneeId: issue?.assigneeId }), { as: 'app' });
      notified = { recordId: top.recordId, at: new Date().toISOString() };
    } catch (error) {
      // A failed comment must not undo the saved record or hide the verdict in the panel.
      console.error(`Duplicate comment on ${record.issueKey} failed: ${error.status || ''} ${error.message}`);
    }
  }

  await records.saveCheck(projectId, recordId, {
    verdict: result.verdict,
    topRecordId: top?.recordId || null,
    topScore: top?.score ?? null,
    matchCount: result.matches.length,
    checkedAt: new Date().toISOString(),
    notified,
  });
  return result;
};

/**
 * Creates or updates the experiment record of a work item, then runs the check.
 * @returns {{ record, check }} the saved record (presented) and the check result
 */
export const registerExperiment = async ({ projectId, projectKey, issue, input, accountId, siteUrl, source = SOURCES.JIRA_FORM, as = 'user' }) => {
  const schema = await getSchema(projectId);
  if (!schema) throw new UserError('This project has no parameter schema yet. A project administrator can set one up in the project settings under DejaRun settings.', 'no_schema');

  const { details, problems } = sanitizeDetails(input, schema);
  if (problems.length) throw new UserError(problems.slice(0, 5).join(' '), 'invalid_record');

  const id = issueRecordId(issue.id);
  const existing = await records.getRecord(projectId, id);
  const saved = await records.saveRecord(
    {
      ...details,
      id,
      projectId,
      projectKey,
      issueId: String(issue.id),
      issueKey: issue.key,
      title: issue.summary || existing?.title || issue.key,
      source: existing?.source || source,
    },
    accountId
  );
  const check = await checkRecord({ projectId, recordId: id, siteUrl, notify: true, as });
  return { record: presentRecord(saved, siteUrl), check };
};

/** Everything the issue panel shows for one work item. */
export const getIssueState = async ({ projectId, issueId, siteUrl }) => {
  const recordId = issueRecordId(issueId);
  const [schema, record, decision] = await Promise.all([getSchema(projectId), records.getRecord(projectId, recordId), records.getDecision(projectId, recordId)]);
  if (!schema || !record) return { schema, record: null, check: null, decision: null };
  const check = await checkRecord({ projectId, recordId, siteUrl });
  return { schema, record: presentRecord(record, siteUrl), check, decision };
};

const DECISION = { LINKED: 'linked_repeat', PROCEED: 'proceed_with_reason' };
export const DECISION_TYPES = DECISION;

/** Loads a record and one of its prior runs, making sure both belong to the project. */
const loadPair = async (projectId, recordId, priorRecordId) => {
  const [record, prior] = await Promise.all([records.getRecord(projectId, recordId), records.getRecord(projectId, priorRecordId)]);
  if (!record) throw new UserError('This work item has no experiment record yet.', 'no_record');
  if (!prior || prior.id === record.id) throw new UserError('That prior run no longer exists in this project.', 'no_prior');
  return { record, prior };
};

/** Picks the link type used for repeats: Duplicate when the site has it, otherwise Relates. */
const repeatLinkType = async (as) => {
  const types = await jira.getIssueLinkTypes({ as });
  const byName = (name) => types.find((type) => String(type.name).toLowerCase() === name);
  return byName('duplicate') || byName('relates') || types[0] || null;
};

/**
 * "Link as repeat": the researcher decides not to run the experiment again.
 * Links the work item to the prior run's work item (when it has one), leaves
 * a comment, and records the decision.
 */
export const linkAsRepeat = async ({ projectId, recordId, priorRecordId, accountId, siteUrl, as = 'user' }) => {
  const { record, prior } = await loadPair(projectId, recordId, priorRecordId);

  let linked = false;
  if (record.issueKey && prior.issueKey) {
    const type = await repeatLinkType(as);
    if (type) {
      // The first work item reads "duplicates <prior>", the prior one "is duplicated by <this>".
      await jira.createIssueLink({ typeName: type.name, inwardKey: record.issueKey, outwardKey: prior.issueKey }, { as });
      linked = true;
    }
  }

  const decision = {
    type: DECISION.LINKED,
    priorRecordId: prior.id,
    priorLabel: prior.issueKey || prior.title || 'Confluence report',
    priorUrl: recordUrl(prior, siteUrl),
    linked,
    by: accountId || null,
    at: new Date().toISOString(),
  };
  await records.saveDecision(projectId, recordId, decision);
  if (record.issueKey) {
    try {
      await jira.addComment(record.issueKey, decisionComment(decision), { as });
    } catch (error) {
      console.error(`Decision comment on ${record.issueKey} failed: ${error.status || ''} ${error.message}`);
    }
  }
  return decision;
};

/**
 * "Proceed with reason": the researcher runs the experiment anyway, for
 * example as a deliberate reproduction, and says why. The reason is kept.
 */
export const proceedWithReason = async ({ projectId, recordId, priorRecordId, reason, accountId, siteUrl, as = 'user' }) => {
  const text = String(reason ?? '').trim().slice(0, 1000);
  if (text.length < 10) throw new UserError('Give a reason of at least 10 characters, so others can see why this experiment is repeated.', 'invalid_reason');
  const { record, prior } = await loadPair(projectId, recordId, priorRecordId);

  const decision = {
    type: DECISION.PROCEED,
    priorRecordId: prior.id,
    priorLabel: prior.issueKey || prior.title || 'Confluence report',
    priorUrl: recordUrl(prior, siteUrl),
    reason: text,
    by: accountId || null,
    at: new Date().toISOString(),
  };
  await records.saveDecision(projectId, recordId, decision);
  if (record.issueKey) {
    try {
      await jira.addComment(record.issueKey, decisionComment(decision), { as });
    } catch (error) {
      console.error(`Decision comment on ${record.issueKey} failed: ${error.status || ''} ${error.message}`);
    }
  }
  return decision;
};

/** Removes the decision so the researcher can decide again. Comments and links already made stay. */
export const clearDecision = (projectId, recordId) => records.deleteDecision(projectId, recordId);
