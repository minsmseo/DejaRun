import { kvs, WhereConditions } from '@forge/kvs';

/**
 * Thin wrapper around Forge hosted storage (KVS). All DejaRun data lives
 * here, inside Atlassian's platform; nothing is sent anywhere else.
 *
 * Key layout:
 *   schema:{projectId}                the project's parameter schema
 *   rec:{projectId}:{recordId}        one experiment record
 *   chk:{projectId}:{recordId}        latest check result and notification state of a record
 *   dec:{projectId}:{recordId}        the decision taken on a record (link as repeat, proceed with reason)
 *
 * Record ids are "issue-{issueId}" for experiments that have a Jira work
 * item and "page-{pageId}" for experiments that only exist as a Confluence report.
 */

export const get = async (key) => (await kvs.get(key)) ?? null;

export const set = (key, value) => kvs.set(key, value);

export const remove = (key) => kvs.delete(key);

/** Returns every entry whose key starts with `prefix`. */
export const listByPrefix = async (prefix) => {
  const entries = [];
  let cursor;
  do {
    let query = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) query = query.cursor(cursor);
    const page = await query.getMany();
    entries.push(...page.results.map((entry) => ({ key: entry.key, value: entry.value })));
    cursor = page.nextCursor;
  } while (cursor);
  return entries;
};
