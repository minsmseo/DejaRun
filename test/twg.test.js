import test from 'node:test';
import assert from 'node:assert/strict';

import { getOpenWork, getPagePeople, getRunContext, pageAri, TwgError, userAri } from '../src/clients/twg.js';

const user = (accountId, name) => ({ node: { __typename: 'AtlassianUser', accountId, name } });
const item = (key, statusKey, statusName = 'To Do') => ({
  node: { __typename: 'JiraWorkItem', key, summary: `Summary ${key}`, webUrl: `https://example.test/browse/${key}`, status: { name: statusName, statusCategory: { key: statusKey } } },
});

test('aris are built the way the API expects', () => {
  assert.equal(userAri('abc'), 'ari:cloud:identity::user/abc');
  assert.equal(pageAri('cloud-1', '42'), 'ari:cloud:confluence:cloud-1:page/42');
});

test('page people: creator and contributors, without repeating the creator', async () => {
  const request = async () => ({
    data: {
      confluencePageCreator: { edges: [user('u1', 'Ada Isadora')] },
      confluencePageContributors: { edges: [user('u1', 'Ada Isadora'), user('u2', 'Ryan Lee'), null] },
    },
  });
  const result = await getPagePeople(request, { cloudId: 'c', pageId: '1' });
  assert.deepEqual(result.creator, { accountId: 'u1', name: 'Ada Isadora' });
  assert.deepEqual(result.contributors, [{ accountId: 'u2', name: 'Ryan Lee' }]);
  assert.equal(result.partial, false);
});

test('errors with no data throw, errors next to data are marked partial', async () => {
  await assert.rejects(() => getPagePeople(async () => ({ errors: [{ message: 'status code is: 403' }] }), { cloudId: 'c', pageId: '1' }), TwgError);
  await assert.rejects(() => getPagePeople(async () => { throw new Error('network'); }, { cloudId: 'c', pageId: '1' }), TwgError);
  const partial = await getPagePeople(
    async () => ({ data: { confluencePageCreator: { edges: [null] }, confluencePageContributors: { edges: [user('u2', 'Ryan Lee')] } }, errors: [{ message: 'one node failed' }] }),
    { cloudId: 'c', pageId: '1' }
  );
  assert.equal(partial.creator, null);
  assert.equal(partial.partial, true);
});

test('open work: skips done items, follows pagination, stops at the page cap', async () => {
  const calls = [];
  const request = async (query, variables) => {
    calls.push(variables.after);
    const page = calls.length;
    return {
      data: {
        atlassianUserAssignedJiraWorkItems: {
          edges: page === 1 ? [item('A-1', 'done', 'Done'), item('A-2', 'new')] : [item('A-3', 'indeterminate', 'In Progress')],
          // The API says there is always another page; the client must stop by itself.
          pageInfo: { hasNextPage: true, endCursor: `cursor-${page}` },
        },
      },
    };
  };
  const result = await getOpenWork(request, { accountId: 'u1' });
  assert.deepEqual(calls, [null, 'cursor-1']);
  assert.deepEqual(result.items.map((entry) => entry.key), ['A-2', 'A-3']);
  assert.equal(result.more, true);
});

test('run context: owner first, roles merged, each part fails on its own', async () => {
  const request = async (query) => {
    if (query.includes('dejarun_pagePeople')) {
      return { data: { confluencePageCreator: { edges: [user('owner', 'Ada Isadora')] }, confluencePageContributors: { edges: [user('u2', 'Ryan Lee')] } } };
    }
    if (query.includes('dejarun_linkedPages')) throw new Error('boom');
    return { data: { atlassianUserAssignedJiraWorkItems: { edges: [item('A-2', 'new')], pageInfo: { hasNextPage: false } } } };
  };
  const context = await getRunContext(request, { cloudId: 'c', ownerId: 'owner', ownerName: 'Ada Isadora', reportPageId: '9' });
  assert.equal(context.available, true);
  assert.deepEqual(context.people.map((person) => person.accountId), ['owner', 'u2']);
  assert.deepEqual(context.people[0].roles, ['Owner of the work item', 'Wrote the report']);
  assert.equal(context.people[0].openWork.items[0].key, 'A-2');
  assert.equal(context.linkedPages, null);
});

test('run context: when the graph gives nothing, it is reported as unavailable', async () => {
  const request = async () => ({ errors: [{ message: 'User is not permitted to query this organization' }] });
  const context = await getRunContext(request, { cloudId: 'c', ownerId: 'owner', ownerName: 'Ada Isadora', reportPageId: '9' });
  assert.equal(context.available, false);
  assert.deepEqual(context.people.map((person) => person.openWork), [null]);
});
