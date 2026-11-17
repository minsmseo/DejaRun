import Resolver from '@forge/resolver';
import * as jira from '../clients/jira';
import { getSchema, saveSchema } from '../data/schema.js';
import { EXAMPLE_SCHEMAS, emptySchema, sanitizeSchema } from '../domain/schema.js';
import { UserError } from '../services/errors.js';
import { issueRecordId } from '../domain/record.js';
import { deleteRecord } from '../data/records.js';
import { getRegistry } from '../services/registry.js';
import { importReports, scanReports } from '../services/backfill.js';
import { getSeedStatus, runSeedStep, SEED_STEPS } from '../seed/seed.js';
import { clearDecision, getIssueState, linkAsRepeat, proceedWithReason, registerExperiment } from '../services/experiments.js';

const resolver = new Resolver();

/**
 * Wraps a resolver so the UI always gets { ok, data } or { ok, error }.
 * Expected problems carry a readable message; anything else is logged and
 * reported generically so internals are never shown to the user.
 */
const define = (name, fn) =>
  resolver.define(name, async (request) => {
    try {
      return { ok: true, data: await fn(request) };
    } catch (error) {
      if (error instanceof UserError) {
        return { ok: false, error: { code: error.code, message: error.message } };
      }
      if (error.status === 401 || error.status === 403) {
        return { ok: false, error: { code: 'forbidden', message: 'You do not have permission to do this.' } };
      }
      console.error(`Resolver ${name} failed: ${error.status || ''} ${error.message}`);
      return { ok: false, error: { code: 'unexpected', message: 'Something went wrong. Try again in a moment.' } };
    }
  });

/** The project always comes from the page context, never from the payload. */
const projectOf = (context) => {
  const project = context.extension?.project;
  if (!project?.id) throw new UserError('DejaRun must be opened from a Jira project.', 'no_project');
  return { projectId: String(project.id), projectKey: project.key };
};

/**
 * Project administrators can edit the parameter schema. Jira administrators
 * can too: they can open every project's settings even when the project's
 * permission scheme does not list them as project administrators.
 */
const canAdministerProject = async (projectId) => {
  const permissions = await jira.getMyPermissions(['ADMINISTER_PROJECTS', 'ADMINISTER'], { projectId });
  return permissions.ADMINISTER_PROJECTS || permissions.ADMINISTER;
};

const requireProjectAdmin = async (projectId) => {
  if (!(await canAdministerProject(projectId))) {
    throw new UserError('Only project administrators can change the parameter schema.', 'forbidden');
  }
};

// ----- Settings (Jira project settings page) -----

define('getSettings', async ({ context }) => {
  const { projectId, projectKey } = projectOf(context);
  const [schema, canEdit] = await Promise.all([getSchema(projectId), canAdministerProject(projectId)]);
  const examples = Object.entries(EXAMPLE_SCHEMAS).map(([id, example]) => ({ id, label: example.label, description: example.description }));
  return { schema, projectKey, canEdit, examples };
});

/** Returns a starting schema for the settings screen. Nothing is saved until the user saves. */
define('getStartingSchema', async ({ payload, context }) => {
  const project = projectOf(context);
  const source = payload.source === 'empty' ? emptySchema() : EXAMPLE_SCHEMAS[payload.source]?.schema;
  if (!source) throw new UserError('That example schema does not exist.');
  return sanitizeSchema(source, project).schema;
});

define('saveSchema', async ({ payload, context }) => {
  const project = projectOf(context);
  await requireProjectAdmin(project.projectId);
  const { schema, problems } = sanitizeSchema(payload.schema, project);
  if (problems.length) throw new UserError(problems.slice(0, 5).join(' '), 'invalid_schema');
  return saveSchema(schema, context.accountId);
});

// ----- Issue panel -----

/** The work item always comes from the page context, never from the payload. */
const issueOf = (context) => {
  const issue = context.extension?.issue;
  if (!issue?.id) throw new UserError('DejaRun must be opened from a work item.', 'no_issue');
  return { issueId: String(issue.id), issueKey: issue.key };
};

/** Adds what only Jira knows: who owns each prior run and who took the decision. */
const withPeople = async (state) => {
  const issueIds = (state.check?.matches || []).map((match) => match.issueId).filter(Boolean);
  const [issues, names] = await Promise.all([
    issueIds.length ? jira.getIssuesById(issueIds) : {},
    state.decision?.by ? jira.getDisplayNames([state.decision.by]) : {},
  ]);
  return {
    ...state,
    check: state.check && { ...state.check, matches: state.check.matches.map((match) => ({ ...match, owner: issues[match.issueId]?.assignee || null, ownerId: issues[match.issueId]?.assigneeId || null })) },
    decision: state.decision && { ...state.decision, byName: names[state.decision.by] || null },
  };
};

const panelState = async (context) => {
  const { projectId } = projectOf(context);
  const { issueId, issueKey } = issueOf(context);
  const [state, permissions] = await Promise.all([
    getIssueState({ projectId, issueId, siteUrl: context.siteUrl }),
    jira.getMyPermissions(['EDIT_ISSUES', 'ADMINISTER_PROJECTS', 'ADMINISTER'], { projectId }),
  ]);
  return {
    ...(await withPeople(state)),
    issueKey,
    canEdit: permissions.EDIT_ISSUES,
    canAdminister: permissions.ADMINISTER_PROJECTS || permissions.ADMINISTER,
  };
};

/** Registering conditions or taking a decision changes the work item, so it needs edit permission. */
const requireEdit = async (projectId) => {
  if (!(await jira.getMyPermissions(['EDIT_ISSUES'], { projectId })).EDIT_ISSUES) {
    throw new UserError('You do not have permission to edit work items in this project.', 'forbidden');
  }
};

define('getPanel', ({ context }) => panelState(context));

define('saveExperiment', async ({ payload, context }) => {
  const { projectId, projectKey } = projectOf(context);
  const { issueId } = issueOf(context);
  await requireEdit(projectId);
  const issue = await jira.getIssue(issueId);
  if (!issue) throw new UserError('This work item no longer exists or you cannot see it.', 'no_issue');
  await registerExperiment({ projectId, projectKey, issue, input: payload.details, accountId: context.accountId, siteUrl: context.siteUrl });
  return panelState(context);
});

define('linkAsRepeat', async ({ payload, context }) => {
  const { projectId } = projectOf(context);
  await requireEdit(projectId);
  await linkAsRepeat({
    projectId,
    recordId: issueRecordId(issueOf(context).issueId),
    priorRecordId: String(payload.priorRecordId || ''),
    accountId: context.accountId,
    siteUrl: context.siteUrl,
  });
  return panelState(context);
});

define('proceedWithReason', async ({ payload, context }) => {
  const { projectId } = projectOf(context);
  await requireEdit(projectId);
  await proceedWithReason({
    projectId,
    recordId: issueRecordId(issueOf(context).issueId),
    priorRecordId: String(payload.priorRecordId || ''),
    reason: payload.reason,
    accountId: context.accountId,
    siteUrl: context.siteUrl,
  });
  return panelState(context);
});

define('clearDecision', async ({ context }) => {
  const { projectId } = projectOf(context);
  await requireEdit(projectId);
  await clearDecision(projectId, issueRecordId(issueOf(context).issueId));
  return panelState(context);
});

define('removeExperiment', async ({ context }) => {
  const { projectId } = projectOf(context);
  await requireEdit(projectId);
  await deleteRecord(projectId, issueRecordId(issueOf(context).issueId));
  return panelState(context);
});

// ----- Experiment registry and Confluence import (Jira project page) -----

define('getRegistry', async ({ context }) => {
  const { projectId } = projectOf(context);
  const [registry, permissions] = await Promise.all([
    getRegistry({ projectId, siteUrl: context.siteUrl }),
    jira.getMyPermissions(['EDIT_ISSUES', 'ADMINISTER_PROJECTS', 'ADMINISTER'], { projectId }),
  ]);
  return { ...registry, canEdit: permissions.EDIT_ISSUES, canAdminister: permissions.ADMINISTER_PROJECTS || permissions.ADMINISTER };
});

define('scanReports', async ({ context }) => {
  const { projectId } = projectOf(context);
  await requireEdit(projectId);
  return scanReports({ projectId, siteUrl: context.siteUrl });
});

define('importReports', async ({ payload, context }) => {
  const { projectId, projectKey } = projectOf(context);
  await requireEdit(projectId);
  return importReports({ projectId, projectKey, pageIds: payload.pageIds, accountId: context.accountId, siteUrl: context.siteUrl });
});

// ----- Demo data (Jira admin page) -----

const requireSiteAdmin = async () => {
  if (!(await jira.getMyPermissions(['ADMINISTER'])).ADMINISTER) {
    throw new UserError('Only Jira administrators can load demo data.', 'forbidden');
  }
};

define('getSeedStatus', async () => {
  await requireSiteAdmin();
  return { projects: await getSeedStatus(), steps: SEED_STEPS };
});

define('runSeedStep', async ({ payload, context }) => {
  await requireSiteAdmin();
  const message = await runSeedStep({ projectKey: payload.projectKey, step: payload.step, accountId: context.accountId });
  return { message };
});

export const handler = resolver.getDefinitions();
