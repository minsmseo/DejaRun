import { DEFAULT_THRESHOLDS } from '../engine/similarity.js';
import { normalizeUnit } from '../engine/units.js';

/**
 * Parameter schema: how one Jira project describes an experiment.
 *
 * Pure functions, no Forge APIs. A schema is set up by a project
 * administrator and has:
 * - systems / methods: optional pick lists for the two fixed fields
 * - weights: how much System and Method count in the similarity score
 * - fields: the experiment conditions (categorical or numeric)
 * - thresholds: when a score means Duplicate or Similar
 * - spaceKey: the Confluence space that holds the experiment reports
 */

export const FIELD_TYPES = { CATEGORICAL: 'categorical', NUMERIC: 'numeric' };
export const TOLERANCE_MODES = { ABSOLUTE: 'absolute', PERCENT: 'percent' };
export const MAX_FIELDS = 30;
const MAX_OPTIONS = 50;

const text = (value, max = 80) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

const number = (value, fallback) => {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Cleans a list of pick-list options: trimmed, no blanks, no duplicates (ignoring case). */
export const cleanOptions = (values) => {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const option = text(value);
    const key = option.toLowerCase();
    if (!option || seen.has(key)) continue;
    seen.add(key);
    result.push(option);
    if (result.length >= MAX_OPTIONS) break;
  }
  return result;
};

/** "Cure temperature" -> "cure_temperature". Used once, when a field is created. */
const slug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'field';

/** Gives a new field a key that no other field in the schema uses. */
const uniqueKey = (name, used) => {
  const base = slug(name);
  let key = base;
  for (let suffix = 2; used.has(key) || key === 'system' || key === 'method'; suffix += 1) key = `${base}_${suffix}`;
  return key;
};

/**
 * Validates and normalizes a schema coming from the settings screen.
 * Field keys are kept once assigned, so renaming a field does not detach
 * the values already saved in experiment records.
 *
 * @returns {{ schema: object, problems: string[] }} problems is empty when the schema can be saved.
 */
export const sanitizeSchema = (input, { projectId, projectKey }) => {
  const problems = [];
  const source = input && typeof input === 'object' ? input : {};

  const systemWeight = number(source.weights?.system, 3);
  const methodWeight = number(source.weights?.method, 2);
  if (systemWeight < 0 || methodWeight < 0) problems.push('Weights cannot be negative.');

  const duplicate = number(source.thresholds?.duplicate, DEFAULT_THRESHOLDS.duplicate);
  const similar = number(source.thresholds?.similar, DEFAULT_THRESHOLDS.similar);
  const minCoverage = number(source.thresholds?.minCoverage, DEFAULT_THRESHOLDS.minCoverage);
  for (const [label, value] of [['Duplicate threshold', duplicate], ['Similar threshold', similar], ['Minimum compared share', minCoverage]]) {
    if (value < 0 || value > 1) problems.push(`${label} must be between 0% and 100%.`);
  }
  if (similar > duplicate) problems.push('The Similar threshold cannot be higher than the Duplicate threshold.');

  const rawFields = Array.isArray(source.fields) ? source.fields : [];
  if (rawFields.length > MAX_FIELDS) problems.push(`A schema can have at most ${MAX_FIELDS} parameters.`);

  const usedKeys = new Set(rawFields.map((field) => text(field?.key, 40)).filter(Boolean));
  const seenKeys = new Set();
  const seenNames = new Set();
  const fields = rawFields.slice(0, MAX_FIELDS).map((raw, index) => {
    const name = text(raw?.name);
    const label = name || `Parameter ${index + 1}`;
    if (!name) problems.push(`Parameter ${index + 1} needs a name.`);
    if (name && seenNames.has(name.toLowerCase())) problems.push(`Two parameters are both called "${name}".`);
    seenNames.add(name.toLowerCase());

    let key = text(raw?.key, 40);
    if (!key || seenKeys.has(key) || key === 'system' || key === 'method') {
      key = uniqueKey(label, new Set([...usedKeys, ...seenKeys]));
    }
    seenKeys.add(key);

    const weight = number(raw?.weight, 1);
    if (weight < 0) problems.push(`The weight of "${label}" cannot be negative.`);

    if (raw?.type === FIELD_TYPES.NUMERIC) {
      const toleranceValue = number(raw?.tolerance?.value, 0);
      if (toleranceValue < 0) problems.push(`The tolerance of "${label}" cannot be negative.`);
      return {
        key,
        name,
        type: FIELD_TYPES.NUMERIC,
        unit: normalizeUnit(text(raw?.unit, 20)),
        tolerance: {
          mode: raw?.tolerance?.mode === TOLERANCE_MODES.PERCENT ? TOLERANCE_MODES.PERCENT : TOLERANCE_MODES.ABSOLUTE,
          value: toleranceValue,
        },
        weight,
      };
    }
    return { key, name, type: FIELD_TYPES.CATEGORICAL, options: cleanOptions(raw?.options), weight };
  });

  if (systemWeight + methodWeight + fields.reduce((sum, field) => sum + field.weight, 0) <= 0) {
    problems.push('At least one field needs a weight above zero, otherwise nothing can be compared.');
  }

  return {
    schema: {
      projectId: String(projectId),
      projectKey: String(projectKey || ''),
      systems: cleanOptions(source.systems),
      methods: cleanOptions(source.methods),
      weights: { system: systemWeight, method: methodWeight },
      thresholds: { duplicate, similar, minCoverage },
      fields,
      spaceKey: text(source.spaceKey, 40).toUpperCase(),
    },
    problems: [...new Set(problems)],
  };
};

/** An empty schema a project administrator can fill in from scratch. */
export const emptySchema = () => ({
  systems: [],
  methods: [],
  weights: { system: 3, method: 2 },
  thresholds: { ...DEFAULT_THRESHOLDS },
  fields: [],
  spaceKey: '',
});

/**
 * Built-in example schemas. Both describe fictional labs; they exist so a
 * project administrator has something concrete to start from and adjust.
 */
export const EXAMPLE_SCHEMAS = {
  adhesive: {
    label: 'Adhesive formulation',
    description: 'Resin, hardener ratio, filler loading, cure temperature and time, substrate.',
    schema: {
      systems: ['Bio-epoxy BE-200', 'Bio-epoxy BE-310', 'Lignin-phenolic LP-10'],
      methods: ['Lap shear test', 'Peel test'],
      weights: { system: 3, method: 2 },
      thresholds: { ...DEFAULT_THRESHOLDS },
      fields: [
        { key: 'resin_type', name: 'Resin type', type: 'categorical', weight: 2, options: ['Epoxidized soybean oil', 'Epoxidized linseed oil', 'Lignin phenolic'] },
        { key: 'hardener_ratio', name: 'Hardener ratio', type: 'numeric', unit: 'wt%', tolerance: { mode: 'absolute', value: 1 }, weight: 1.5 },
        { key: 'filler_loading', name: 'Filler loading', type: 'numeric', unit: 'wt%', tolerance: { mode: 'absolute', value: 2 }, weight: 1.5 },
        { key: 'cure_temperature', name: 'Cure temperature', type: 'numeric', unit: '°C', tolerance: { mode: 'absolute', value: 5 }, weight: 1.5 },
        { key: 'cure_time', name: 'Cure time', type: 'numeric', unit: 'min', tolerance: { mode: 'percent', value: 10 }, weight: 1 },
        { key: 'substrate', name: 'Substrate', type: 'categorical', weight: 1.5, options: ['Aluminum', 'Steel', 'Glass fiber composite'] },
      ],
      spaceKey: '',
    },
  },
  coating: {
    label: 'Coating cure process',
    description: 'Coating type, film thickness, cure temperature and time, humidity.',
    schema: {
      systems: ['Waterborne acrylic WA-5', 'UV-cure urethane UU-2', 'Sol-gel hardcoat SG-8'],
      methods: ['Pencil hardness', 'Cross-cut adhesion'],
      weights: { system: 3, method: 2 },
      thresholds: { ...DEFAULT_THRESHOLDS },
      fields: [
        { key: 'coating_type', name: 'Coating type', type: 'categorical', weight: 2, options: ['Clear coat', 'Primer', 'Hardcoat'] },
        { key: 'film_thickness', name: 'Film thickness', type: 'numeric', unit: 'µm', tolerance: { mode: 'absolute', value: 5 }, weight: 1.5 },
        { key: 'cure_temperature', name: 'Cure temperature', type: 'numeric', unit: '°C', tolerance: { mode: 'absolute', value: 5 }, weight: 1.5 },
        { key: 'cure_time', name: 'Cure time', type: 'numeric', unit: 'min', tolerance: { mode: 'percent', value: 10 }, weight: 1 },
        { key: 'humidity', name: 'Humidity', type: 'numeric', unit: '%RH', tolerance: { mode: 'absolute', value: 10 }, weight: 1 },
      ],
      spaceKey: '',
    },
  },
};
