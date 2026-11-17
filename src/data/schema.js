import * as store from './store.js';

/** Storage for parameter schemas, one per Jira project. */

const key = (projectId) => `schema:${projectId}`;

/** Returns the project's schema, or null when the project has none yet. */
export const getSchema = (projectId) => store.get(key(projectId));

/** Saves a schema that has already been through sanitizeSchema. */
export const saveSchema = async (schema, accountId) => {
  const saved = { ...schema, updatedAt: new Date().toISOString(), updatedBy: accountId || null };
  await store.set(key(schema.projectId), saved);
  return saved;
};
