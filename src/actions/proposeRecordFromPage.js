import * as confluence from '../clients/confluence';
import { extractDetails, looksLikeExperiment, tablesFromStorage } from '../backfill/parseTable.js';
import * as records from '../data/records.js';
import { pageRecordId, sanitizeDetails } from '../domain/record.js';
import { comparePriorRuns } from '../services/experiments.js';
import { UserError } from '../services/errors.js';
import { action, presentMatchForAgent, resolveProject, VERDICT_NOTE } from './shared.js';

/** Accepts a page id or a Confluence page URL and returns the page id. */
export const pageIdFrom = (reference) => {
  const text = String(reference || '').trim();
  if (/^\d+$/.test(text)) return text;
  const match = /\/pages\/(\d+)/.exec(text) || /[?&]pageId=(\d+)/.exec(text);
  if (!match) throw new UserError('Give me the Confluence page as its page id or its full URL.', 'no_page');
  return match[1];
};

/**
 * propose-record-from-page: reads the conditions table of a Confluence page
 * and returns the experiment record it would create. Nothing is stored;
 * register-experiment does that after the user confirms.
 */
export const proposeRecordFromPage = action('propose-record-from-page', async (payload) => {
  const { projectId, siteUrl, schema } = await resolveProject(payload);
  const pageId = pageIdFrom(payload.page);
  const page = await confluence.getPage(pageId);
  if (!page) throw new UserError('That Confluence page does not exist or you cannot see it.', 'no_page');

  const extraction = extractDetails(tablesFromStorage(page.storage), schema);
  if (!looksLikeExperiment(extraction)) {
    return {
      page: { id: page.id, title: page.title, url: page.url },
      canBeRegistered: false,
      reason: 'The page has no conditions table whose labels match this project\'s parameter names.',
      expectedLabels: ['System', 'Test method', ...schema.fields.map((field) => field.name), 'Outcome', 'Run date', 'Findings'],
    };
  }

  const { details, problems } = sanitizeDetails({ ...extraction.details, report: { url: page.url, title: page.title, pageId: page.id } }, schema);
  const allRecords = await records.listRecords(projectId);
  const existing = allRecords.find((record) => record.id === pageRecordId(page.id) || String(record.report?.pageId) === String(page.id));
  const check = problems.length ? null : comparePriorRuns({ schema, details, allRecords, siteUrl, excludeId: existing?.id, limit: 3 });

  return {
    page: { id: page.id, title: page.title, url: page.url },
    canBeRegistered: problems.length === 0 && !existing,
    alreadyRegisteredAs: existing ? existing.issueKey || existing.id : null,
    problems,
    labelsRead: extraction.found,
    proposedRecord: {
      system: details.system,
      method: details.method,
      conditions: Object.fromEntries(schema.fields.filter((field) => details.parameters[field.key]).map((field) => [field.name, `${details.parameters[field.key].value} ${details.parameters[field.key].unit || ''}`.trim()])),
      outcome: details.outcome,
      runDate: details.performedOn || null,
      findings: details.findings || null,
    },
    comparedWithRegistry: check && { verdict: check.verdict, priorRuns: check.matches.map((match) => presentMatchForAgent(match, schema)) },
    nextStep: 'Show the proposed record to the user. Only after the user confirms, call register-experiment with this page.',
    note: VERDICT_NOTE,
  };
});
