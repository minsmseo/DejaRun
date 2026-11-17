import { convert, dimensionOf, normalizeUnit, parseNumber } from '../engine/units.js';

/**
 * Experiment record: the structured description of one experiment.
 *
 * Pure functions, no Forge APIs. A record belongs to a Jira project and is
 * tied either to a work item (id "issue-{issueId}") or, for past experiments
 * that only exist as a Confluence report, to a page (id "page-{pageId}").
 */

export const OUTCOMES = ['planned', 'success', 'failed', 'inconclusive'];
export const SOURCES = { JIRA_FORM: 'jira_form', CONFLUENCE_BACKFILL: 'confluence_backfill' };

export const issueRecordId = (issueId) => `issue-${issueId}`;
export const pageRecordId = (pageId) => `page-${pageId}`;

const text = (value, max) => String(value ?? '').trim().replace(/[ \t]+/g, ' ').slice(0, max);

/** Accepts only http(s) links, so a record can never carry a script URL into the UI. */
const cleanUrl = (value) => {
  const url = String(value ?? '').trim();
  return /^https?:\/\/\S+$/i.test(url) ? url.slice(0, 500) : '';
};

/** "2026-03-14" (or an ISO timestamp) -> "2026-03-14", anything else -> ''. */
const cleanDate = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? '').trim());
  return match && !Number.isNaN(Date.parse(match[1])) ? match[1] : '';
};

/**
 * Validates the experiment details typed into the registration form (or
 * extracted from a report) against the project's schema.
 *
 * Values for fields that are not in the schema are dropped. Numeric values
 * must be numbers, and their unit must be convertible to the field's unit.
 *
 * @returns {{ details: object, problems: string[] }}
 */
export const sanitizeDetails = (input, schema) => {
  const problems = [];
  const source = input && typeof input === 'object' ? input : {};

  const system = text(source.system, 80);
  const method = text(source.method, 80);
  if (!system) problems.push('Choose the system under test.');
  if (!method) problems.push('Choose the test method.');

  const parameters = {};
  for (const field of schema?.fields || []) {
    const entry = source.parameters?.[field.key];
    const raw = entry && typeof entry === 'object' ? entry.value : entry;
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;

    if (field.type !== 'numeric') {
      parameters[field.key] = { value: text(raw, 80) };
      continue;
    }
    const value = parseNumber(raw);
    if (value === null) {
      problems.push(`"${field.name}" must be a number.`);
      continue;
    }
    const fieldUnit = normalizeUnit(field.unit);
    const unit = normalizeUnit(entry && typeof entry === 'object' ? entry.unit : '') || fieldUnit;
    if (convert(value, unit, fieldUnit || unit) === null) {
      problems.push(`"${field.name}" is in ${unit}, which cannot be converted to ${fieldUnit}.`);
      continue;
    }
    parameters[field.key] = { value, unit };
  }

  const outcome = OUTCOMES.includes(source.outcome) ? source.outcome : 'planned';
  const reportUrl = cleanUrl(source.report?.url);
  if (String(source.report?.url ?? '').trim() && !reportUrl) problems.push('The report link must start with http:// or https://.');

  return {
    details: {
      objective: text(source.objective, 300),
      objectiveTag: text(source.objectiveTag, 40),
      system,
      method,
      parameters,
      outcome,
      findings: String(source.findings ?? '').trim().slice(0, 1500),
      performedOn: cleanDate(source.performedOn),
      report: { url: reportUrl, title: text(source.report?.title, 200), pageId: text(source.report?.pageId, 40) },
    },
    problems: [...new Set(problems)],
  };
};

/** Units a researcher can pick for a numeric field: every unit of the same dimension. */
export const unitChoices = (fieldUnit) => {
  const unit = normalizeUnit(fieldUnit);
  const groups = { temperature: ['°C', 'K'], time: ['min', 'h'], concentration: ['wt%', 'ppm'], pressure: ['kPa', 'bar'] };
  return groups[dimensionOf(unit)] || (unit ? [unit] : []);
};
