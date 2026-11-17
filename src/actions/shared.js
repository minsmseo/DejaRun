import * as jira from '../clients/jira';
import { extractDetails } from '../backfill/parseTable.js';
import { getSchema } from '../data/schema.js';
import * as records from '../data/records.js';
import { pageRecordId } from '../domain/record.js';
import { UserError } from '../services/errors.js';

/**
 * Shared plumbing for Rovo agent actions (also exposed as MCP tools).
 *
 * Inputs are extracted from the conversation by a language model, so they
 * are treated as untrusted hints. Every action resolves the project by
 * calling Jira as the current user: if that user cannot see the project,
 * Jira refuses and the action stops. No input can widen access.
 */

const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,19}$/;
const ISSUE_KEY = /^([A-Z][A-Z0-9_]{1,19})-\d+$/;

/**
 * Resolves the project from the input, from a work item key in the input,
 * or from where the chat was opened.
 */
export const resolveProject = async (payload, issueKeyHint) => {
  const fromIssue = ISSUE_KEY.exec(String(issueKeyHint || '').trim().toUpperCase())?.[1];
  const key = String(payload?.projectKey || fromIssue || payload?.context?.jira?.projectKey || '').trim().toUpperCase();
  if (!key) throw new UserError('Which Jira project should I look at? Give me the project key, for example BAF.', 'no_project');
  if (!PROJECT_KEY.test(key)) throw new UserError(`"${key}" is not a valid Jira project key.`, 'no_project');

  let project;
  let siteUrl;
  try {
    [project, siteUrl] = await Promise.all([jira.getProject(key), jira.getSiteUrl()]);
  } catch (error) {
    if (error.status === 404 || error.status === 403 || error.status === 401) {
      throw new UserError(`Project ${key} does not exist or you do not have access to it.`, 'no_project');
    }
    throw error;
  }
  const schema = await getSchema(String(project.id));
  if (!schema) throw new UserError(`Project ${key} has no DejaRun parameter schema yet. A project administrator can set one up in the project settings under DejaRun settings.`, 'no_schema');
  return { projectId: String(project.id), projectKey: project.key, projectName: project.name, siteUrl, schema };
};

/**
 * Finds a record by what a person would call it: a work item key ("BAF-3"),
 * a record id ("issue-10001", "page-458781") or a Confluence page id.
 */
export const findRecord = async (projectId, reference) => {
  const text = String(reference || '').trim();
  if (!text) return null;
  const all = await records.listRecords(projectId);
  const upper = text.toUpperCase();
  return (
    all.find((record) => record.issueKey === upper) ||
    all.find((record) => record.id === text.toLowerCase()) ||
    (/^\d+$/.test(text) ? all.find((record) => record.id === pageRecordId(text)) : null) ||
    all.find((record) => String(record.title || '').toLowerCase() === text.toLowerCase()) ||
    null
  );
};

export const requireRecord = async (projectId, reference, what = 'experiment') => {
  const record = await findRecord(projectId, reference);
  if (!record) throw new UserError(`There is no ${what} record for "${reference}" in this project. Use the work item key (for example BAF-3) or the record id.`, 'no_record');
  return record;
};

/**
 * Turns "Cure temperature: 122 °C; Substrate: Aluminum" into experiment
 * details under the schema. Names that are not in the schema are reported
 * back so the agent can say what it could not use.
 */
export const parseConditions = (text, schema, fixed = {}) => {
  const pairs = String(text || '')
    .split(/[;\n]/)
    .map((part) => /^\s*(.+?)\s*[:=]\s*(.+?)\s*$/.exec(part))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]);
  const rows = [...Object.entries(fixed).filter(([, value]) => String(value ?? '').trim()), ...pairs];
  const extraction = extractDetails([rows], schema);
  const known = new Set(['system', 'method', 'test method', 'objective', 'outcome', 'findings', 'run date', ...schema.fields.map((field) => field.name.toLowerCase())]);
  const unknown = pairs.map(([name]) => name).filter((name) => !known.has(name.replace(/\s*[([].*$/, '').trim().toLowerCase()));
  return { details: extraction.details, unknown };
};

/** What the agent needs to know about the schema to phrase conditions correctly. */
export const describeSchema = (schema) => ({
  systems: schema.systems,
  methods: schema.methods,
  parameters: schema.fields.map((field) =>
    field.type === 'numeric'
      ? { name: field.name, type: 'numeric', unit: field.unit, tolerance: `${field.tolerance.value}${field.tolerance.mode === 'percent' ? '%' : ` ${field.unit}`}` }
      : { name: field.name, type: 'categorical', allowedValues: field.options }
  ),
});

/** Compact, agent-friendly view of a record. */
export const presentForAgent = (record, schema) => ({
  reference: record.issueKey || record.recordId,
  title: record.title,
  url: record.url,
  source: record.issueKey ? 'Jira work item' : 'Confluence report only',
  system: record.system,
  method: record.method,
  conditions: Object.fromEntries(
    schema.fields.filter((field) => record.parameters[field.key]).map((field) => [field.name, `${record.parameters[field.key].value}${record.parameters[field.key].unit ? ` ${record.parameters[field.key].unit}` : ''}`])
  ),
  outcome: record.outcome,
  findings: record.findings || 'No findings recorded.',
  runDate: record.performedOn || null,
  report: record.report ? { title: record.report.title, url: record.report.url } : null,
});

/** Compact view of a prior run match, with the field-by-field comparison. */
export const presentMatchForAgent = (match, schema) => ({
  ...presentForAgent(match, schema),
  verdict: match.verdict,
  similarityPercent: Math.round(match.score * 100),
  comparison: match.rows.map((row) => ({ condition: row.name, thisExperiment: row.newValue || null, priorRun: row.priorValue || null, result: row.status, why: row.note })),
});

export const VERDICT_NOTE =
  'Verdicts and comparisons are computed by deterministic code from the project schema. Report them as they are; do not change, soften or override a verdict. Always cite the reference and url of every experiment you mention.';

/**
 * Wraps an action handler. Expected problems come back as { error } so the
 * agent can explain them; unexpected ones are logged and reported generically.
 */
export const action = (name, fn) => async (payload, context) => {
  try {
    return await fn(payload || {}, context || {});
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    if (error.status === 401 || error.status === 403) {
      return { error: 'The current user does not have permission to do this in Jira or Confluence.' };
    }
    console.error(`Action ${name} failed: ${error.status || ''} ${error.message}`);
    return { error: 'DejaRun could not complete this action because of an unexpected error. Try again.' };
  }
};
