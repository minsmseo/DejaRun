import * as jira from '../clients/jira';
import * as confluence from '../clients/confluence';
import { getSchema, saveSchema } from '../data/schema.js';
import * as records from '../data/records.js';
import { issueRecordId, sanitizeDetails, SOURCES } from '../domain/record.js';
import { EXAMPLE_SCHEMAS, sanitizeSchema } from '../domain/schema.js';
import { UserError } from '../services/errors.js';
import { DEMO_ORGANISATION, DEMO_PROJECTS } from './demoData.js';

/**
 * Demo data loader. Creates the two fictional projects described in
 * demoData.js so the whole product can be tried on an empty site.
 *
 * The work is split into small steps because one Forge invocation has a
 * time limit; the admin screen calls the steps one after another. Every
 * step is safe to repeat: it only creates what is missing.
 */

const DAY = 24 * 60 * 60 * 1000;
export const SEED_STEPS = ['project', 'experiments', 'reports'];

const demoProject = (key) => {
  const project = DEMO_PROJECTS.find((candidate) => candidate.key === key);
  if (!project) throw new UserError(`Unknown demo project ${key}.`);
  return project;
};

const findJiraProject = async (key) => {
  try {
    return await jira.getProject(key);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
};

/** Runs async work over a list a few items at a time. */
const inBatches = async (items, size, fn) => {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(fn));
  }
};

const dateDaysAgo = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
const hasIssue = (experiment) => experiment.where !== 'report';
const hasReport = (experiment) => experiment.where !== 'jira';
const reportTitle = (experiment) => `Experiment report: ${experiment.title}`;

/** What already exists, shown on the admin screen. */
export const getSeedStatus = async () =>
  Promise.all(
    DEMO_PROJECTS.map(async (demo) => {
      const [project, space] = await Promise.all([findJiraProject(demo.key), confluence.getSpaceByKey(demo.key).catch(() => null)]);
      const [schema, existing] = project ? await Promise.all([getSchema(project.id), records.listRecords(project.id)]) : [null, []];
      return {
        key: demo.key,
        name: demo.name,
        description: demo.description,
        project: Boolean(project && schema),
        experiments: existing.length > 0,
        reports: Boolean(space) && existing.some((record) => record.report?.pageId),
        counts: {
          workItems: demo.experiments.filter(hasIssue).length,
          reportOnly: demo.experiments.filter((experiment) => !hasIssue(experiment)).length,
        },
      };
    })
  );

/** Step 1: the Jira project and its parameter schema. */
const seedProject = async (demo, accountId) => {
  let project = await findJiraProject(demo.key);
  const created = !project;
  if (!project) {
    await jira.createProject({
      key: demo.key,
      name: demo.name,
      description: demo.description,
      projectTypeKey: 'software',
      projectTemplateKey: 'com.pyxis.greenhopper.jira:gh-simplified-kanban-classic',
      leadAccountId: accountId,
      assigneeType: 'UNASSIGNED',
    });
    project = await jira.getProject(demo.key);
  }

  let schemaNote = 'kept its existing parameter schema';
  if (!(await getSchema(project.id))) {
    const example = { ...EXAMPLE_SCHEMAS[demo.schemaExample].schema, spaceKey: demo.key };
    const { schema } = sanitizeSchema(example, { projectId: String(project.id), projectKey: demo.key });
    await saveSchema(schema, accountId);
    schemaNote = `got the "${EXAMPLE_SCHEMAS[demo.schemaExample].label}" parameter schema`;
  }
  return `${created ? 'Created' : 'Found'} project ${demo.key}; it ${schemaNote}.`;
};

/** People who can be assigned work in the project, so the demo experiments have different owners. */
const pickOwners = async (projectKey, accountId) => {
  let users = [];
  try {
    users = await jira.findAssignableUsers(projectKey);
  } catch (error) {
    users = [];
  }
  // Sites often have service accounts that can be assigned work. Keep only accounts whose
  // display name reads like a person's name ("Ada Isadora"), so the demo owners are people.
  const looksLikePerson = (name) => /^[A-Z][a-z]+( [A-Z][a-z]+)+$/.test(String(name || ''));
  const ids = users
    .filter((user) => user.active !== false && user.accountType === 'atlassian' && looksLikePerson(user.displayName))
    .map((user) => user.accountId);
  return [...new Set([accountId, ...ids])].slice(0, 4);
};

/** Step 2: work items, their experiment records, and the decisions of the planned ones. */
const seedExperiments = async (demo, accountId) => {
  const project = await findJiraProject(demo.key);
  if (!project) throw new UserError(`Create the Jira project ${demo.key} first.`);
  const projectId = String(project.id);
  const schema = await getSchema(projectId);
  if (!schema) throw new UserError(`Project ${demo.key} has no parameter schema yet.`);
  if ((await records.listRecords(projectId)).length) return `Project ${demo.key} already has experiment records; none were added.`;

  const issueTypes = await jira.getCreateIssueTypes(projectId);
  const standard = issueTypes.filter((type) => !type.subtask && (type.hierarchyLevel ?? 0) === 0);
  const issueType = standard.find((type) => (type.untranslatedName || type.name) === 'Task') || standard[0];
  if (!issueType) throw new UserError(`Project ${demo.key} has no standard work type.`);

  const owners = await pickOwners(demo.key, accountId);
  const withIssue = demo.experiments.filter(hasIssue);
  const created = await jira.createIssuesBulk(
    withIssue.map((experiment, index) => ({
      project: { id: projectId },
      issuetype: { id: issueType.id },
      summary: experiment.title,
      labels: ['experiment'],
      assignee: { accountId: owners[index % owners.length] },
    }))
  );
  const issues = created.issues || [];
  if (issues.length !== withIssue.length) throw new UserError(`Jira created ${issues.length} of ${withIssue.length} work items for ${demo.key}. Delete the project and try again.`);

  const saved = [];
  await inBatches(withIssue, 5, async (experiment, offset) => {
    const issue = issues[withIssue.indexOf(experiment)];
    const { details } = sanitizeDetails({ ...experiment, performedOn: experiment.outcome === 'planned' ? '' : dateDaysAgo(experiment.daysAgo) }, schema);
    const record = await records.saveRecord(
      { ...details, id: issueRecordId(issue.id), projectId, projectKey: demo.key, issueId: String(issue.id), issueKey: issue.key, title: experiment.title, source: SOURCES.JIRA_FORM },
      owners[withIssue.indexOf(experiment) % owners.length]
    );
    saved.push({ experiment, record });
    if (experiment.outcome !== 'planned') await jira.transitionToDone(issue.key);
  });

  // Decisions taken on the planned experiments, so the registry shows saved and justified repeats.
  const siteUrl = await jira.getSiteUrl();
  for (const { experiment, record } of saved.filter((entry) => entry.experiment.decision)) {
    const prior = saved.find((entry) => entry.experiment.title === experiment.decision.priorTitle)?.record;
    if (!prior) continue;
    await records.saveDecision(projectId, record.id, {
      type: experiment.decision.type,
      priorRecordId: prior.id,
      priorLabel: prior.issueKey,
      priorUrl: `${siteUrl}/browse/${prior.issueKey}`,
      ...(experiment.decision.reason ? { reason: experiment.decision.reason } : { linked: false }),
      by: record.createdBy,
      at: new Date(Date.now() - (experiment.daysAgo - 1) * DAY).toISOString(),
    });
  }
  return `Added ${issues.length} work items with experiment records to ${demo.key}, owned by ${owners.length} ${owners.length === 1 ? 'person' : 'people'}.`;
};

const escapeHtml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The body of a report page: a short introduction and a conditions table the import can read. */
const reportBody = (experiment, schema) => {
  const row = (label, value) => `<tr><th><p>${escapeHtml(label)}</p></th><td><p>${escapeHtml(value)}</p></td></tr>`;
  const conditions = schema.fields
    .map((field) => {
      const entry = experiment.parameters[field.key];
      return entry ? row(field.name, `${entry.value}${entry.unit ? ` ${entry.unit}` : ''}`) : '';
    })
    .join('');
  return [
    `<p>${escapeHtml(DEMO_ORGANISATION)} experiment report. Fictional demo data.</p>`,
    '<h2>Conditions</h2>',
    '<table><tbody>',
    row('System', experiment.system),
    row('Test method', experiment.method),
    row('Objective', experiment.objective),
    conditions,
    row('Outcome', experiment.outcome[0].toUpperCase() + experiment.outcome.slice(1)),
    row('Run date', dateDaysAgo(experiment.daysAgo)),
    row('Findings', experiment.findings),
    '</tbody></table>',
    '<h2>Discussion</h2>',
    `<p>${escapeHtml(experiment.findings)}</p>`,
  ].join('');
};

/** Step 3: the Confluence space and the report pages. */
const seedReports = async (demo) => {
  const project = await findJiraProject(demo.key);
  if (!project) throw new UserError(`Create the Jira project ${demo.key} first.`);
  const projectId = String(project.id);
  const schema = await getSchema(projectId);
  if (!schema) throw new UserError(`Project ${demo.key} has no parameter schema yet.`);

  let space = await confluence.getSpaceByKey(demo.key);
  const createdSpace = !space;
  if (!space) {
    await confluence.createSpace({ key: demo.key, name: demo.name, description: demo.description });
    space = await confluence.getSpaceByKey(demo.key);
  }
  if (!space) throw new UserError(`Confluence space ${demo.key} could not be created.`);

  const existingPages = createdSpace ? [] : (await confluence.listSpacePages(space.id)).pages;
  const byTitle = new Map(existingPages.map((page) => [page.title, page]));
  const allRecords = await records.listRecords(projectId);

  let createdPages = 0;
  await inBatches(demo.experiments.filter(hasReport), 3, async (experiment) => {
    const title = reportTitle(experiment);
    let page = byTitle.get(title);
    if (!page) {
      page = await confluence.createPage({ spaceId: space.id, parentId: space.homepageId, title, storage: reportBody(experiment, schema) });
      createdPages += 1;
    }
    // Experiments that also have a work item point to their report.
    const record = allRecords.find((candidate) => candidate.title === experiment.title && candidate.issueKey);
    if (record && record.report?.pageId !== page.id) {
      await records.saveRecord({ ...record, report: { url: page.url, title: page.title, pageId: page.id } }, record.updatedBy);
    }
  });
  return `${createdSpace ? 'Created' : 'Found'} space ${demo.key} and added ${createdPages} report pages.`;
};

export const runSeedStep = async ({ projectKey, step, accountId }) => {
  const demo = demoProject(projectKey);
  if (step === 'project') return seedProject(demo, accountId);
  if (step === 'experiments') return seedExperiments(demo, accountId);
  if (step === 'reports') return seedReports(demo);
  throw new UserError(`Unknown step ${step}.`);
};
