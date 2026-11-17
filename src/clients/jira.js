import { route } from '@forge/api';
import { send } from './http';

/**
 * Jira REST calls used by DejaRun. Every function takes `as`:
 * "user" (default) runs with the permissions of the person using the app,
 * "app" runs as the app and is only used where there is no user (event triggers).
 */

export const getProject = (projectIdOrKey, { as = 'user' } = {}) => send('jira', as, route`/rest/api/3/project/${projectIdOrKey}`);

/**
 * Checks the current user's permissions. Pass a projectId for project
 * permissions (e.g. ADMINISTER_PROJECTS); omit it for global ones (ADMINISTER).
 * @returns {Object<string, boolean>}
 */
export const getMyPermissions = async (permissions, { projectId, as = 'user' } = {}) => {
  const list = permissions.join(',');
  const data = projectId
    ? await send('jira', as, route`/rest/api/3/mypermissions?permissions=${list}&projectId=${projectId}`)
    : await send('jira', as, route`/rest/api/3/mypermissions?permissions=${list}`);
  return Object.fromEntries(permissions.map((name) => [name, Boolean(data.permissions?.[name]?.havePermission)]));
};

/** Reduces a Jira issue to the fields DejaRun shows. */
const toIssue = (issue) => ({
  id: String(issue.id),
  key: issue.key,
  projectId: issue.fields?.project?.id ? String(issue.fields.project.id) : null,
  projectKey: issue.fields?.project?.key || null,
  summary: issue.fields?.summary || '',
  status: issue.fields?.status?.name || '',
  statusCategory: issue.fields?.status?.statusCategory?.key || '',
  assigneeId: issue.fields?.assignee?.accountId || null,
  assignee: issue.fields?.assignee?.displayName || null,
  reporterId: issue.fields?.reporter?.accountId || null,
  reporter: issue.fields?.reporter?.displayName || null,
  created: issue.fields?.created || null,
  description: issue.fields?.description || null,
});

const ISSUE_FIELDS = 'summary,status,assignee,reporter,project,created';

/** Reads one work item. Returns null when it does not exist or the caller cannot see it. */
export const getIssue = async (issueIdOrKey, { as = 'user', withDescription = false } = {}) => {
  const fields = withDescription ? `${ISSUE_FIELDS},description` : ISSUE_FIELDS;
  try {
    return toIssue(await send('jira', as, route`/rest/api/3/issue/${issueIdOrKey}?fields=${fields}`));
  } catch (error) {
    if (error.status === 404 || error.status === 403) return null;
    throw error;
  }
};

/**
 * Reads several work items by id in one search. Items the caller cannot see
 * are simply missing from the result.
 * @returns {Object<string, object>} issue id -> issue
 */
export const getIssuesById = async (issueIds, { as = 'user' } = {}) => {
  const ids = [...new Set(issueIds.map(String))].filter((id) => /^\d+$/.test(id)).slice(0, 200);
  const found = {};
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    const page = await send('jira', as, route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: { jql: `id in (${chunk.join(',')})`, fields: ISSUE_FIELDS.split(','), maxResults: 100 },
    });
    for (const issue of page.issues || []) found[String(issue.id)] = toIssue(issue);
  }
  return found;
};

/** Adds a comment. `body` is an Atlassian Document Format document. */
export const addComment = (issueIdOrKey, body, { as = 'user' } = {}) =>
  send('jira', as, route`/rest/api/3/issue/${issueIdOrKey}/comment`, { method: 'POST', body: { body } });

/** Link types configured on the site (Duplicate, Relates, ...). */
export const getIssueLinkTypes = async ({ as = 'user' } = {}) => {
  const data = await send('jira', as, route`/rest/api/3/issueLinkType`);
  return data.issueLinkTypes || [];
};

/** Links two work items. `outwardKey` is the item the link text reads from. */
export const createIssueLink = ({ typeName, inwardKey, outwardKey }, { as = 'user' } = {}) =>
  send('jira', as, route`/rest/api/3/issueLink`, {
    method: 'POST',
    body: { type: { name: typeName }, inwardIssue: { key: inwardKey }, outwardIssue: { key: outwardKey } },
  });

/**
 * Looks up display names for account ids. Names are never stored by
 * DejaRun; they are fetched when something is shown.
 * @returns {Object<string, string>} accountId -> display name (missing when not visible)
 */
export const getDisplayNames = async (accountIds, { as = 'user' } = {}) => {
  const unique = [...new Set(accountIds.filter(Boolean))].slice(0, 50);
  const entries = await Promise.all(
    unique.map(async (accountId) => {
      try {
        const user = await send('jira', as, route`/rest/api/3/user?accountId=${accountId}`);
        return [accountId, user.displayName || null];
      } catch (error) {
        return [accountId, null];
      }
    })
  );
  return Object.fromEntries(entries.filter(([, name]) => name));
};

/** Base URL of the site, for building links where no page context exists (event triggers). */
export const getSiteUrl = async ({ as = 'user' } = {}) => {
  const info = await send('jira', as, route`/rest/api/3/serverInfo`);
  return String(info.baseUrl || '').replace(/\/$/, '');
};
// ----- Used only by the demo data loader -----

export const createProject = (body, { as = 'user' } = {}) => send('jira', as, route`/rest/api/3/project`, { method: 'POST', body });

/** Issue types that can be created in a project (used to pick "Task"). */
export const getCreateIssueTypes = async (projectIdOrKey, { as = 'user' } = {}) => {
  const data = await send('jira', as, route`/rest/api/3/issue/createmeta/${projectIdOrKey}/issuetypes`);
  return data.issueTypes || data.values || [];
};

export const createIssuesBulk = (issueFields, { as = 'user' } = {}) =>
  send('jira', as, route`/rest/api/3/issue/bulk`, {
    method: 'POST',
    body: { issueUpdates: issueFields.map((fields) => ({ fields })) },
  });

/** Moves a work item to the first available status in the "done" category. */
export const transitionToDone = async (issueKey, { as = 'user' } = {}) => {
  const data = await send('jira', as, route`/rest/api/3/issue/${issueKey}/transitions`);
  const done = (data.transitions || []).find((transition) => transition.to?.statusCategory?.key === 'done');
  if (!done) return false;
  await send('jira', as, route`/rest/api/3/issue/${issueKey}/transitions`, { method: 'POST', body: { transition: { id: done.id } } });
  return true;
};

/** Users who can be assigned work items in a project. */
export const findAssignableUsers = (projectKey, { as = 'user' } = {}) =>
  send('jira', as, route`/rest/api/3/user/assignable/search?project=${projectKey}&maxResults=20`);