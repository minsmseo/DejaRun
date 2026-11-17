import * as store from './store.js';

/**
 * Storage for experiment records, their latest check and the decision
 * taken on them. See store.js for the key layout.
 */

const recordKey = (projectId, recordId) => `rec:${projectId}:${recordId}`;
const checkKey = (projectId, recordId) => `chk:${projectId}:${recordId}`;
const decisionKey = (projectId, recordId) => `dec:${projectId}:${recordId}`;

export const getRecord = (projectId, recordId) => store.get(recordKey(projectId, recordId));

/** Every experiment record of a project. */
export const listRecords = async (projectId) => (await store.listByPrefix(`rec:${projectId}:`)).map((entry) => entry.value);

/**
 * Creates or updates a record. `createdAt` and `createdBy` are kept from the
 * first save; `updatedAt` always moves.
 */
export const saveRecord = async (record, accountId) => {
  const existing = await getRecord(record.projectId, record.id);
  const now = new Date().toISOString();
  const saved = {
    ...record,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || accountId || null,
    updatedAt: now,
    updatedBy: accountId || null,
  };
  await store.set(recordKey(record.projectId, record.id), saved);
  return saved;
};

/** Removes a record together with its check state and decision. */
export const deleteRecord = async (projectId, recordId) => {
  await Promise.all([
    store.remove(recordKey(projectId, recordId)),
    store.remove(checkKey(projectId, recordId)),
    store.remove(decisionKey(projectId, recordId)),
  ]);
};

// ----- Latest check (verdict and what the assignee was last told) -----

export const getCheck = (projectId, recordId) => store.get(checkKey(projectId, recordId));
export const saveCheck = (projectId, recordId, check) => store.set(checkKey(projectId, recordId), check);
export const listChecks = async (projectId) =>
  Object.fromEntries((await store.listByPrefix(`chk:${projectId}:`)).map((entry) => [entry.key.slice(`chk:${projectId}:`.length), entry.value]));

// ----- Decisions (link as repeat, proceed with reason) -----

export const getDecision = (projectId, recordId) => store.get(decisionKey(projectId, recordId));
export const saveDecision = (projectId, recordId, decision) => store.set(decisionKey(projectId, recordId), decision);
export const deleteDecision = (projectId, recordId) => store.remove(decisionKey(projectId, recordId));
export const listDecisions = async (projectId) =>
  Object.fromEntries((await store.listByPrefix(`dec:${projectId}:`)).map((entry) => [entry.key.slice(`dec:${projectId}:`.length), entry.value]));
