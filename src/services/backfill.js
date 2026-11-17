import * as confluence from '../clients/confluence';
import { extractDetails, looksLikeExperiment, tablesFromStorage } from '../backfill/parseTable.js';
import { getSchema } from '../data/schema.js';
import * as records from '../data/records.js';
import { pageRecordId, sanitizeDetails, SOURCES } from '../domain/record.js';
import { comparePriorRuns, presentRecord } from './experiments.js';
import { UserError } from './errors.js';

/**
 * Confluence backfill: finds past experiments that only exist as report
 * pages and turns them into experiment records after a person confirms.
 *
 * Extraction is done by code (see backfill/parseTable.js): a page is offered
 * when its conditions table uses the names of the project's schema.
 */

/** Removes a leading "Experiment report:" style prefix so the record reads like the other experiments. */
const titleFromPage = (title) => String(title || '').replace(/^\s*(experiment\s+)?report\s*[:\-]\s*/i, '').trim() || String(title || 'Untitled report');

/** Extracts and validates the experiment described by one page. */
const readPage = (page, schema) => {
  const extraction = extractDetails(tablesFromStorage(page.storage), schema);
  if (!looksLikeExperiment(extraction)) return null;
  const { details, problems } = sanitizeDetails({ ...extraction.details, report: { url: page.url, title: page.title, pageId: page.id } }, schema);
  return { details, problems, found: extraction.found };
};

const loadSpace = async (projectId) => {
  const schema = await getSchema(projectId);
  if (!schema) throw new UserError('This project has no parameter schema yet. Set one up in the project settings under DejaRun settings.', 'no_schema');
  if (!schema.spaceKey) throw new UserError('No Confluence space is linked to this project. Enter the space key in the project settings under DejaRun settings.', 'no_space');
  let space;
  try {
    space = await confluence.getSpaceByKey(schema.spaceKey);
  } catch (error) {
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      throw new UserError('DejaRun could not read Confluence. Check that the app is also installed in Confluence and that you can open the space.', 'no_confluence');
    }
    throw error;
  }
  if (!space) throw new UserError(`The Confluence space ${schema.spaceKey} does not exist or you cannot see it.`, 'no_space');
  return { schema, space };
};

/**
 * Scans the linked space and returns the pages that describe an experiment
 * which is not in the registry yet.
 */
export const scanReports = async ({ projectId, siteUrl }) => {
  const { schema, space } = await loadSpace(projectId);
  const [{ pages, truncated }, allRecords] = await Promise.all([confluence.listSpacePages(space.id), records.listRecords(projectId)]);

  // A page is already covered when a record was imported from it or links to it as its report.
  const known = new Set(allRecords.flatMap((record) => [record.pageId, record.report?.pageId]).filter(Boolean).map(String));

  const candidates = [];
  let alreadyRegistered = 0;
  for (const page of pages) {
    if (known.has(page.id)) {
      alreadyRegistered += 1;
      continue;
    }
    const read = readPage(page, schema);
    if (!read) continue;
    const check = read.problems.length ? null : comparePriorRuns({ schema, details: read.details, allRecords, siteUrl, limit: 1 });
    candidates.push({
      pageId: page.id,
      title: titleFromPage(page.title),
      pageTitle: page.title,
      url: page.url,
      lastModified: page.lastModified,
      details: read.details,
      found: read.found,
      problems: read.problems,
      verdict: check?.verdict || null,
      closest: check?.matches[0] ? { label: check.matches[0].issueKey || check.matches[0].title, score: check.matches[0].score } : null,
    });
  }

  return {
    space: { key: space.key, name: space.name },
    scanned: pages.length,
    truncated,
    alreadyRegistered,
    notExperiments: pages.length - alreadyRegistered - candidates.length,
    candidates: candidates.sort((a, b) => a.title.localeCompare(b.title)),
  };
};

/**
 * Registers the confirmed pages. Every page is read and extracted again on
 * the server, so only what is really on the page is stored.
 * @returns {{ imported: Array, skipped: Array<{ pageId, reason }> }}
 */
export const importReports = async ({ projectId, projectKey, pageIds, accountId, siteUrl }) => {
  const { schema, space } = await loadSpace(projectId);
  const ids = [...new Set((Array.isArray(pageIds) ? pageIds : []).map(String))].filter((id) => /^\d+$/.test(id)).slice(0, 50);
  if (!ids.length) throw new UserError('Select at least one report to import.', 'nothing_selected');

  const imported = [];
  const skipped = [];
  for (const pageId of ids) {
    const page = await confluence.getPage(pageId);
    if (!page || String(page.spaceId) !== String(space.id)) {
      skipped.push({ pageId, reason: 'The page is not in the linked space or you cannot see it.' });
      continue;
    }
    const read = readPage(page, schema);
    if (!read) {
      skipped.push({ pageId, reason: 'The page no longer has a conditions table that matches the schema.' });
      continue;
    }
    if (read.problems.length) {
      skipped.push({ pageId, reason: read.problems.join(' ') });
      continue;
    }
    const saved = await records.saveRecord(
      { ...read.details, id: pageRecordId(page.id), projectId, projectKey, pageId: page.id, title: titleFromPage(page.title), source: SOURCES.CONFLUENCE_BACKFILL },
      accountId
    );
    imported.push(presentRecord(saved, siteUrl));
  }
  return { imported, skipped };
};
