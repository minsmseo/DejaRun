import { convert, formatNumber, normalizeUnit, parseNumber } from './units.js';

/**
 * Field-by-field comparison of two experiment records.
 *
 * Pure functions, no Forge APIs. The output is the comparison table the
 * product always shows next to a verdict: for every field the new value,
 * the prior value and whether they match.
 *
 * Shapes used here:
 *
 * schema = {
 *   weights: { system: number, method: number },
 *   fields: [{ key, name, type: 'categorical' | 'numeric', unit, weight,
 *              tolerance: { mode: 'absolute' | 'percent', value } }],
 * }
 *
 * record = {
 *   system: string, method: string,
 *   parameters: { [fieldKey]: { value, unit } },
 * }
 */

export const STATUS = {
  MATCH: 'match',
  MISMATCH: 'mismatch',
  /** Only one side has a value, or the units cannot be converted. Left out of the score. */
  NOT_COMPARABLE: 'not_comparable',
};

/** Field keys of the two fixed fields every record has. */
export const SYSTEM_KEY = 'system';
export const METHOD_KEY = 'method';

const DEFAULT_WEIGHT = 1;

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

/** Categorical values match when equal ignoring case and repeated spaces. */
const normalizeText = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const weightOf = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : DEFAULT_WEIGHT;
};

const compareCategorical = (newValue, priorValue) => {
  if (isBlank(newValue) || isBlank(priorValue)) {
    return { status: STATUS.NOT_COMPARABLE, note: 'Only one experiment has a value.' };
  }
  return normalizeText(newValue) === normalizeText(priorValue)
    ? { status: STATUS.MATCH, note: 'Same value.' }
    : { status: STATUS.MISMATCH, note: 'Different value.' };
};

/** Text such as "±5 °C" or "±10%" for the comparison table. */
export const describeTolerance = (field) => {
  const value = Number(field?.tolerance?.value);
  if (!Number.isFinite(value) || value <= 0) return 'exact';
  if (field.tolerance.mode === 'percent') return `±${formatNumber(value)}%`;
  const unit = normalizeUnit(field.unit);
  return `±${formatNumber(value)}${unit ? ` ${unit}` : ''}`;
};

/**
 * Compares two numeric values.
 * Both are converted to the unit of the schema field first. The difference
 * matches when it is within the field tolerance:
 * - absolute: |new - prior| <= tolerance, in the field's unit
 * - percent:  |new - prior| <= tolerance% of the larger of the two magnitudes
 */
const compareNumeric = (field, newEntry, priorEntry) => {
  const newNumber = parseNumber(newEntry?.value);
  const priorNumber = parseNumber(priorEntry?.value);
  if (newNumber === null || priorNumber === null) {
    return { status: STATUS.NOT_COMPARABLE, note: 'Only one experiment has a value.' };
  }

  // A value saved without a unit is taken to be in the field's unit.
  const fieldUnit = normalizeUnit(field.unit);
  const newUnit = normalizeUnit(newEntry.unit) || fieldUnit;
  const priorUnit = normalizeUnit(priorEntry.unit) || fieldUnit;
  const targetUnit = fieldUnit || newUnit;
  const a = convert(newNumber, newUnit, targetUnit);
  const b = convert(priorNumber, priorUnit, targetUnit);
  if (a === null || b === null) {
    return { status: STATUS.NOT_COMPARABLE, note: `Units cannot be converted (${newUnit || 'none'} and ${priorUnit || 'none'}).` };
  }

  const difference = Math.abs(a - b);
  const toleranceValue = Math.max(0, Number(field?.tolerance?.value) || 0);
  const allowed = field?.tolerance?.mode === 'percent' ? (toleranceValue / 100) * Math.max(Math.abs(a), Math.abs(b)) : toleranceValue;
  // A tiny epsilon keeps 0.1 + 0.2 style rounding from turning a boundary case into a mismatch.
  const within = difference <= allowed + 1e-9;
  const unitText = targetUnit ? ` ${targetUnit}` : '';
  return {
    status: within ? STATUS.MATCH : STATUS.MISMATCH,
    difference,
    note: within
      ? `Difference ${formatNumber(difference)}${unitText} is within ${describeTolerance(field)}.`
      : `Difference ${formatNumber(difference)}${unitText} is outside ${describeTolerance(field)}.`,
  };
};

/** "120 °C", "Aluminum" or '' for display. */
export const displayValue = (field, entry) => {
  if (field.type !== 'numeric') return isBlank(entry?.value) ? '' : String(entry.value).trim();
  const number = parseNumber(entry?.value);
  if (number === null) return '';
  const unit = normalizeUnit(entry?.unit) || normalizeUnit(field.unit);
  return `${formatNumber(number)}${unit ? ` ${unit}` : ''}`;
};

/**
 * Builds the comparison table for two records under one schema.
 * The first two rows are always System and Method, then one row per schema field.
 *
 * @returns {Array<{ key, name, type, weight, newValue, priorValue, status, note, tolerance }>}
 */
export const buildComparison = (schema, newRecord, priorRecord) => {
  const fixed = [
    { key: SYSTEM_KEY, name: 'System', weight: weightOf(schema?.weights?.system) },
    { key: METHOD_KEY, name: 'Method', weight: weightOf(schema?.weights?.method) },
  ].map((field) => ({
    key: field.key,
    name: field.name,
    type: 'categorical',
    weight: field.weight,
    newValue: isBlank(newRecord?.[field.key]) ? '' : String(newRecord[field.key]).trim(),
    priorValue: isBlank(priorRecord?.[field.key]) ? '' : String(priorRecord[field.key]).trim(),
    tolerance: 'exact',
    ...compareCategorical(newRecord?.[field.key], priorRecord?.[field.key]),
  }));

  const parameters = (schema?.fields || []).map((field) => {
    const newEntry = newRecord?.parameters?.[field.key];
    const priorEntry = priorRecord?.parameters?.[field.key];
    const result = field.type === 'numeric' ? compareNumeric(field, newEntry, priorEntry) : compareCategorical(newEntry?.value, priorEntry?.value);
    return {
      key: field.key,
      name: field.name,
      type: field.type === 'numeric' ? 'numeric' : 'categorical',
      weight: weightOf(field.weight),
      newValue: displayValue(field, newEntry),
      priorValue: displayValue(field, priorEntry),
      tolerance: field.type === 'numeric' ? describeTolerance(field) : 'exact',
      ...result,
    };
  });

  return [...fixed, ...parameters];
};
