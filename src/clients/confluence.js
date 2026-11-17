import { route } from '@forge/api';
import { send } from './http';

/**
 * Confluence REST calls used by DejaRun (REST API v2, except space creation
 * which only exists in v1). Calls run as the current user by default, so a
 * person only ever sees pages they could open themselves.
 */

/** A space with more pages than this is only partly scanned by the import. */
export const MAX_SPACE_PAGES = 500;
const PAGE_SIZE = 50;

/** Pulls the paging cursor out of a v2 "next" link. */
const nextCursor = (data) => {
  const next = data?._links?.next;
  if (!next) return null;
  const match = /[?&]cursor=([^&]+)/.exec(next);
  return match ? decodeURIComponent(match[1]) : null;
};

/** Looks up a space by key. Returns null when it does not exist or is hidden. */
export const getSpaceByKey = async (spaceKey, { as = 'user' } = {}) => {
  const data = await send('confluence', as, route`/wiki/api/v2/spaces?keys=${spaceKey}&limit=1`);
  const space = data.results?.[0];
  return space ? { id: space.id, key: space.key, name: space.name, homepageId: space.homepageId } : null;
};

const toPage = (page, base) => ({
  id: String(page.id),
  title: page.title,
  url: page._links?.webui ? `${base}${page._links.webui}` : null,
  lastModified: page.version?.createdAt || null,
  authorId: page.authorId || null,
  storage: page.body?.storage?.value || '',
});

/**
 * Lists the current pages of a space together with their body in storage
 * format, so tables can be read without one request per page.
 * @returns {{ pages: Array, truncated: boolean }}
 */
export const listSpacePages = async (spaceId, { as = 'user' } = {}) => {
  const pages = [];
  let data = await send('confluence', as, route`/wiki/api/v2/spaces/${spaceId}/pages?status=current&body-format=storage&limit=${PAGE_SIZE}`);
  for (;;) {
    const base = data._links?.base || '';
    pages.push(...(data.results || []).map((page) => toPage(page, base)));
    const cursor = nextCursor(data);
    if (!cursor) return { pages, truncated: false };
    if (pages.length >= MAX_SPACE_PAGES) return { pages, truncated: true };
    data = await send('confluence', as, route`/wiki/api/v2/spaces/${spaceId}/pages?status=current&body-format=storage&limit=${PAGE_SIZE}&cursor=${cursor}`);
  }
};

/** Reads one page with its body in storage format. Returns null when it is missing or hidden. */
export const getPage = async (pageId, { as = 'user' } = {}) => {
  try {
    const page = await send('confluence', as, route`/wiki/api/v2/pages/${pageId}?body-format=storage`);
    return { ...toPage(page, page._links?.base || ''), spaceId: page.spaceId };
  } catch (error) {
    if (error.status === 404 || error.status === 403) return null;
    throw error;
  }
};

// ----- Used only by the demo data loader -----

export const createSpace = ({ key, name, description }, { as = 'user' } = {}) =>
  send('confluence', as, route`/wiki/rest/api/space`, {
    method: 'POST',
    body: { key, name, description: { plain: { value: description || '', representation: 'plain' } } },
  });

export const createPage = async ({ spaceId, parentId, title, storage }, { as = 'user' } = {}) => {
  const page = await send('confluence', as, route`/wiki/api/v2/pages`, {
    method: 'POST',
    body: { spaceId, parentId, status: 'current', title, body: { representation: 'storage', value: storage } },
  });
  const base = page._links?.base || '';
  return { id: String(page.id), title: page.title, url: page._links?.webui ? `${base}${page._links.webui}` : null };
};
