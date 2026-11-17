import { convert, normalizeUnit, parseNumber, parseQuantity } from './units.js';

/**
 * Condition filters for questions such as "has anyone cured this resin above
 * 120 °C on aluminum?".
 *
 * Pure functions, no Forge APIs. A filter text is a list of conditions
 * separated by semicolons or new lines:
 *
 *   Cure temperature > 120 °C; Substrate = Aluminum; Outcome = failed
 *
 * Supported operators: =, !=, >, >=, <, <=. Numeric values are converted to
 * the unit of the schema field before they are compared, so "> 393 K" and
 * "> 120 °C" mean the same thing.
 */

const OPERATORS = ['>=', '<=', '!=', '=', '>', '<'];
const normalizeText = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The fields every record has, by the names people use for them. */
const FIXED_FIELDS = { system: 'system', method: 'method', 'test method': 'method', outcome: 'outcome', result: 'outcome' };

const splitCondition = (text) => {
  for (const operator of OPERATORS) {
    const index = text.indexOf(operator);
    if (index > 0) return { name: text.slice(0, index).trim(), operator, value: text.slice(index + operator.length).trim() };
  }
  return null;
};

/**
 * Parses a filter text against a schema.
 * @returns {{ filters: Array, problems: string[] }} problems lists conditions that could not be understood.
 */
export const parseFilters = (text, schema) => {
  const filters = [];
  const problems = [];
  const fields = new Map((schema?.fields || []).map((field) => [normalizeText(field.name), field]));

  for (const part of String(text ?? '').split(/[;\n]/).map((piece) => piece.trim()).filter(Boolean)) {
    const condition = splitCondition(part);
    if (!condition || !condition.value) {
      problems.push(`"${part}" is not a condition. Write it as "name = value" or "name > value".`);
      continue;
    }
    const name = normalizeText(condition.name);
    const field = fields.get(name);

    if (field && field.type === 'numeric') {
      const quantity = parseQuantity(condition.value);
      const fieldUnit = normalizeUnit(field.unit);
      const value = quantity ? convert(quantity.value, quantity.unit || fieldUnit, fieldUnit || quantity.unit) : null;
      if (value === null) {
        problems.push(`"${condition.value}" is not a value for ${field.name}${fieldUnit ? ` (in ${fieldUnit})` : ''}.`);
        continue;
      }
      filters.push({ kind: 'numeric', key: field.key, name: field.name, operator: condition.operator, value, unit: fieldUnit });
      continue;
    }

    const fixed = FIXED_FIELDS[name];
    if (!field && !fixed) {
      problems.push(`"${condition.name}" is not a condition in this project's schema.`);
      continue;
    }
    if (condition.operator !== '=' && condition.operator !== '!=') {
      problems.push(`${field ? field.name : condition.name} is a text value, so it can only be compared with = or !=.`);
      continue;
    }
    filters.push({ kind: 'text', key: field ? field.key : fixed, fixed: !field, name: field ? field.name : condition.name, operator: condition.operator, value: normalizeText(condition.value) });
  }
  return { filters, problems };
};

const compareNumbers = (left, operator, right) => {
  if (operator === '=') return Math.abs(left - right) < 1e-9;
  if (operator === '!=') return Math.abs(left - right) >= 1e-9;
  if (operator === '>') return left > right;
  if (operator === '>=') return left >= right;
  if (operator === '<') return left < right;
  return left <= right;
};

/**
 * True when a record satisfies every filter. A record without a value for a
 * filtered field does not match, because nothing is known about it.
 */
export const matchesFilters = (record, filters) =>
  filters.every((filter) => {
    if (filter.kind === 'numeric') {
      const entry = record?.parameters?.[filter.key];
      const number = parseNumber(entry?.value);
      if (number === null) return false;
      const value = convert(number, normalizeUnit(entry.unit) || filter.unit, filter.unit || normalizeUnit(entry.unit));
      return value !== null && compareNumbers(value, filter.operator, filter.value);
    }
    const raw = filter.fixed ? record?.[filter.key] : record?.parameters?.[filter.key]?.value;
    if (raw === undefined || raw === null || String(raw).trim() === '') return false;
    const same = normalizeText(raw) === filter.value;
    return filter.operator === '=' ? same : !same;
  });
