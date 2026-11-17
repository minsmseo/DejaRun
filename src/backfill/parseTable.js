import { normalizeUnit, parseQuantity } from '../engine/units.js';

/**
 * Reads experiment conditions out of tables.
 *
 * Pure functions, no Forge APIs. Past experiments often exist only as a
 * report page with a conditions table. When the labels in that table match
 * the names in the project's schema, the values can be extracted by code,
 * with no language model involved, and offered to a person for confirmation.
 *
 * A "table" here is a plain array of rows, each row an array of cell texts.
 * Two layouts are understood:
 *   key/value   | Cure temperature | 120 °C |      one condition per row
 *   header row  | Resin type | Cure temperature |  labels in the first row,
 *               | Epoxy      | 120 °C           |  values in the second
 */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°', micro: 'µ', plusmn: '±', ndash: '-', mdash: '-' };

const decodeEntities = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);

/** Text of one XHTML fragment: tags removed, entities decoded, spaces collapsed. */
const cellText = (html) => decodeEntities(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Extracts every table from Confluence storage format (XHTML). Nested tables are not supported. */
export const tablesFromStorage = (storage) => {
  const tables = [];
  for (const table of String(storage || '').match(/<table[\s\S]*?<\/table>/gi) || []) {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) || [])
      .map((row) => (row.match(/<t[hd][\s\S]*?<\/t[hd]>/gi) || []).map(cellText))
      .filter((cells) => cells.length > 0);
    if (rows.length) tables.push(rows);
  }
  return tables;
};

/** Collects the text of an Atlassian Document Format node. */
const adfText = (node) => {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(adfText).join(node.type === 'paragraph' ? ' ' : ' ');
};

/** Extracts every table from an Atlassian Document Format document (a Jira description). */
export const tablesFromAdf = (document) => {
  const tables = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'table') {
      const rows = (node.content || [])
        .filter((row) => row.type === 'tableRow')
        .map((row) => (row.content || []).map((cell) => adfText(cell).replace(/\s+/g, ' ').trim()))
        .filter((cells) => cells.length > 0);
      if (rows.length) tables.push(rows);
      return;
    }
    (node.content || []).forEach(walk);
  };
  walk(document);
  return tables;
};

/** "Cure temperature (°C)" -> { label: "cure temperature", unit: "°C" } */
const parseLabel = (text) => {
  const match = /^(.*?)\s*[([]\s*([^)\]]+)\s*[)\]]\s*:?$/.exec(String(text).trim());
  const label = (match ? match[1] : String(text)).replace(/:$/, '').trim().toLowerCase().replace(/\s+/g, ' ');
  return { label, unit: match ? normalizeUnit(match[2]) : '' };
};

/** Labels for the fixed parts of a record, with the spellings reports tend to use. */
const FIXED_LABELS = {
  system: 'system',
  'material system': 'system',
  product: 'system',
  method: 'method',
  'test method': 'method',
  objective: 'objective',
  purpose: 'objective',
  outcome: 'outcome',
  result: 'outcome',
  findings: 'findings',
  conclusion: 'findings',
  'run date': 'performedOn',
  date: 'performedOn',
  'performed on': 'performedOn',
};

const OUTCOME_WORDS = {
  success: 'success', successful: 'success', succeeded: 'success', pass: 'success', passed: 'success',
  failed: 'failed', fail: 'failed', failure: 'failed',
  inconclusive: 'inconclusive', unclear: 'inconclusive',
  planned: 'planned',
};

const toDate = (text) => {
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso) return iso[1];
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10);
};

/** Uses the schema's own spelling when a value matches a pick-list option ignoring case. */
const canonicalOption = (value, options) => {
  const wanted = value.trim().toLowerCase();
  return (options || []).find((option) => option.toLowerCase() === wanted) || value.trim();
};

/**
 * Turns label/value pairs into experiment details under a schema.
 * @returns {{ details: object, found: string[] }} found lists the labels that were recognized.
 */
const assign = (pairs, schema) => {
  const fields = new Map((schema?.fields || []).map((field) => [field.name.trim().toLowerCase().replace(/\s+/g, ' '), field]));
  const details = { parameters: {} };
  const found = [];

  for (const [rawLabel, rawValue] of pairs) {
    const value = String(rawValue ?? '').trim();
    if (!value) continue;
    const { label, unit: labelUnit } = parseLabel(rawLabel);

    const field = fields.get(label);
    if (field) {
      if (field.type === 'numeric') {
        const quantity = parseQuantity(value);
        if (!quantity) continue;
        details.parameters[field.key] = { value: quantity.value, unit: quantity.unit || labelUnit || normalizeUnit(field.unit) };
      } else {
        details.parameters[field.key] = { value: canonicalOption(value, field.options) };
      }
      found.push(field.name);
      continue;
    }

    const fixed = FIXED_LABELS[label];
    if (!fixed) continue;
    if (fixed === 'system') details.system = canonicalOption(value, schema?.systems);
    else if (fixed === 'method') details.method = canonicalOption(value, schema?.methods);
    else if (fixed === 'outcome') details.outcome = OUTCOME_WORDS[value.toLowerCase().split(/[\s,.;:]/)[0]] || undefined;
    else if (fixed === 'performedOn') details.performedOn = toDate(value);
    else details[fixed] = value;
    if (details[fixed] !== undefined && details[fixed] !== '') found.push(fixed === 'performedOn' ? 'Run date' : fixed[0].toUpperCase() + fixed.slice(1));
  }
  return { details, found: [...new Set(found)] };
};

const isKnownLabel = (text, schema) => {
  const { label } = parseLabel(text);
  return Boolean(FIXED_LABELS[label]) || (schema?.fields || []).some((field) => field.name.trim().toLowerCase().replace(/\s+/g, ' ') === label);
};

/**
 * Extracts experiment details from the tables of one document.
 * The table that yields the most recognized labels wins.
 *
 * @returns {{ details: object, found: string[], parameterCount: number }}
 *   parameterCount is the number of schema parameters that were filled in.
 */
export const extractDetails = (tables, schema) => {
  let best = { details: { parameters: {} }, found: [] };

  for (const rows of tables || []) {
    const candidates = [];
    // Key/value layout: the first cell of a row is a label.
    candidates.push(rows.filter((cells) => cells.length >= 2 && isKnownLabel(cells[0], schema)).map((cells) => [cells[0], cells[1]]));
    // Header layout: at least two labels in the first row, values in the second.
    if (rows.length >= 2 && rows[0].filter((cell) => isKnownLabel(cell, schema)).length >= 2) {
      candidates.push(rows[0].map((label, index) => [label, rows[1][index]]));
    }
    for (const pairs of candidates) {
      const result = assign(pairs, schema);
      if (result.found.length > best.found.length) best = result;
    }
  }

  return { ...best, parameterCount: Object.keys(best.details.parameters).length };
};

/** A document is offered as an experiment only when it names a system or method and at least one parameter. */
export const looksLikeExperiment = (extraction) => extraction.parameterCount >= 1 && Boolean(extraction.details.system || extraction.details.method);
