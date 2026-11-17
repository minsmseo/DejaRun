/**
 * Teamwork Graph client. Every Teamwork Graph query DejaRun makes is in this file.
 *
 * DejaRun's own engine decides whether two experiments are the same. The
 * graph answers a different question: who can tell me about that earlier
 * run, and what are they working on now?
 *
 * The API can only be called as the current user. The UI calls it through
 * `requestTeamworkGraph` from @forge/bridge and the agent actions through
 * `api.asUser().requestTeamworkGraph` from @forge/api, so this module takes
 * the request function as an argument instead of importing either package.
 *
 * Things learned from real calls (see docs/platform-notes.md):
 * - errors arrive next to data with HTTP 200, so `errors` is always checked
 * - a list can contain null edges when one node could not be loaded
 * - `first` is capped at 25 and a short page can still have a next page
 * - team lookups fail on the development site, so no team query is used
 */

const PAGE_SIZE = 25;
/** Upper bound on pages read per list, so one person with a long history cannot stall the panel. */
const MAX_PAGES = 2;

export class TwgError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'TwgError';
    this.errors = errors || [];
  }
}

export const userAri = (accountId) => `ari:cloud:identity::user/${accountId}`;
export const pageAri = (cloudId, pageId) => `ari:cloud:confluence:${cloudId}:page/${pageId}`;

const USER_NODE = 'node { __typename ... on AtlassianUser { accountId name } }';

const PAGE_PEOPLE_QUERY = `query dejarun_pagePeople($id: ID!) {
  confluencePageCreator(id: $id, first: 5) { edges { ${USER_NODE} } }
  confluencePageContributors(id: $id, first: ${PAGE_SIZE}) { edges { ${USER_NODE} } }
}`;

const ASSIGNED_WORK_QUERY = `query dejarun_assignedWork($userId: ID!, $after: String) {
  atlassianUserAssignedJiraWorkItems(userId: $userId, first: ${PAGE_SIZE}, after: $after) {
    edges { node { __typename ... on JiraWorkItem { key summary webUrl status { name statusCategory { key } } } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

const LINKED_PAGES_QUERY = `query dejarun_linkedPages($id: ID!) {
  confluencePageLinkedConfluencePages(id: $id, first: ${PAGE_SIZE}) {
    edges { node { __typename ... on ConfluencePage { title webUrl } } }
  }
}`;

/** Nodes of a connection, skipping the null edges the API returns for nodes it could not load. */
const nodesOf = (connection) => (connection?.edges || []).map((edge) => edge?.node).filter(Boolean);

/**
 * Runs one query. Throws TwgError when the call fails or returns no data.
 * When data and errors arrive together the data is used and `partial` is set.
 */
const run = async (request, query, variables) => {
  let result;
  try {
    result = await request(query, variables);
  } catch (error) {
    throw new TwgError(`Teamwork Graph request failed: ${error?.message || error}`);
  }
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  if (!result?.data) throw new TwgError(errors[0]?.message || 'Teamwork Graph returned no data.', errors);
  return { data: result.data, partial: errors.length > 0 };
};

const toPerson = (node) => (node.accountId ? { accountId: node.accountId, name: node.name || null } : null);

const uniquePeople = (people) => {
  const seen = new Set();
  return people.filter((person) => person && !seen.has(person.accountId) && seen.add(person.accountId));
};

/**
 * Who wrote a Confluence report page.
 * @returns {{ creator: object|null, contributors: Array<{accountId, name}>, partial: boolean }}
 *   contributors does not repeat the creator.
 */
export const getPagePeople = async (request, { cloudId, pageId }) => {
  const { data, partial } = await run(request, PAGE_PEOPLE_QUERY, { id: pageAri(cloudId, pageId) });
  const creator = uniquePeople(nodesOf(data.confluencePageCreator).map(toPerson))[0] || null;
  const contributors = uniquePeople(nodesOf(data.confluencePageContributors).map(toPerson)).filter((person) => person.accountId !== creator?.accountId);
  return { creator, contributors, partial };
};

/**
 * The work items a person is assigned to that are not done.
 * Reads at most MAX_PAGES pages; `more` says whether the person has further work that was not read.
 * @returns {{ items: Array<{key, summary, url, status}>, more: boolean, partial: boolean }}
 */
export const getOpenWork = async (request, { accountId, limit = 5 }) => {
  const open = [];
  let after = null;
  let partial = false;
  let more = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await run(request, ASSIGNED_WORK_QUERY, { userId: userAri(accountId), after });
    partial = partial || result.partial;
    const connection = result.data.atlassianUserAssignedJiraWorkItems;
    for (const node of nodesOf(connection)) {
      if (node.status?.statusCategory?.key === 'done' || !node.key) continue;
      open.push({ key: node.key, summary: node.summary || '', url: node.webUrl || null, status: node.status?.name || '' });
    }
    after = connection?.pageInfo?.hasNextPage ? connection.pageInfo.endCursor : null;
    if (!after) break;
    if (page === MAX_PAGES - 1) more = true;
  }
  return { items: open.slice(0, limit), more: more || open.length > limit, partial };
};

/** Pages linked from a Confluence report page. */
export const getLinkedPages = async (request, { cloudId, pageId }) => {
  const { data, partial } = await run(request, LINKED_PAGES_QUERY, { id: pageAri(cloudId, pageId) });
  const pages = nodesOf(data.confluencePageLinkedConfluencePages)
    .filter((node) => node.title && node.webUrl)
    .map((node) => ({ title: node.title, url: node.webUrl }));
  return { pages, partial };
};

/**
 * Everything the "Ask the people who ran it" area shows for one prior run.
 * Each part fails on its own: a part that could not be read is null, and
 * the caller falls back to what Jira already told it (the assignee).
 *
 * @param {object} run a presented prior run with ownerId, owner and report.pageId
 * @returns {{ people: Array<{accountId, name, roles: string[], openWork}>, linkedPages: Array|null, available: boolean }}
 */
export const getRunContext = async (request, { cloudId, ownerId, ownerName, reportPageId, maxPeople = 3 }) => {
  const settle = (promise) => promise.then((value) => value, () => null);
  const [pagePeople, linked] = await Promise.all([
    reportPageId ? settle(getPagePeople(request, { cloudId, pageId: reportPageId })) : null,
    reportPageId ? settle(getLinkedPages(request, { cloudId, pageId: reportPageId })) : null,
  ]);

  // Owner first, then the report's creator, then its other contributors.
  const byId = new Map();
  const add = (person, role) => {
    if (!person?.accountId) return;
    const entry = byId.get(person.accountId) || { accountId: person.accountId, name: person.name || null, roles: [] };
    if (!entry.name && person.name) entry.name = person.name;
    if (!entry.roles.includes(role)) entry.roles.push(role);
    byId.set(person.accountId, entry);
  };
  if (ownerId) add({ accountId: ownerId, name: ownerName }, 'Owner of the work item');
  add(pagePeople?.creator, 'Wrote the report');
  (pagePeople?.contributors || []).forEach((person) => add(person, 'Contributed to the report'));

  const people = [...byId.values()].slice(0, maxPeople);
  const work = await Promise.all(people.map((person) => settle(getOpenWork(request, { accountId: person.accountId }))));
  return {
    people: people.map((person, index) => ({ ...person, openWork: work[index] })),
    linkedPages: linked ? linked.pages : null,
    // False when the graph gave nothing at all, so the caller can hide the area.
    available: Boolean(pagePeople) || work.some(Boolean),
  };
};
