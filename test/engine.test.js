import test from 'node:test';
import assert from 'node:assert/strict';

import { convert, normalizeUnit, parseNumber, parseQuantity } from '../src/engine/units.js';
import { buildComparison, STATUS } from '../src/engine/compare.js';
import { evaluatePair, findPriorRuns, scoreRows, verdictFor, VERDICT } from '../src/engine/similarity.js';

// A fictional adhesive schema, like demo project A.
const schema = {
  weights: { system: 3, method: 2 },
  thresholds: { duplicate: 0.95, similar: 0.6, minCoverage: 0.6 },
  fields: [
    { key: 'resin', name: 'Resin type', type: 'categorical', weight: 2 },
    { key: 'hardener', name: 'Hardener ratio', type: 'numeric', unit: 'wt%', weight: 1.5, tolerance: { mode: 'absolute', value: 1 } },
    { key: 'filler', name: 'Filler loading', type: 'numeric', unit: 'wt%', weight: 1.5, tolerance: { mode: 'absolute', value: 2 } },
    { key: 'temp', name: 'Cure temperature', type: 'numeric', unit: '°C', weight: 1.5, tolerance: { mode: 'absolute', value: 5 } },
    { key: 'time', name: 'Cure time', type: 'numeric', unit: 'min', weight: 1, tolerance: { mode: 'percent', value: 10 } },
    { key: 'substrate', name: 'Substrate', type: 'categorical', weight: 1.5 },
  ],
};

const record = (id, overrides = {}, parameterOverrides = {}) => ({
  id,
  system: 'Bio-epoxy BE-200',
  method: 'Lap shear test',
  parameters: {
    resin: { value: 'Epoxidized soybean oil' },
    hardener: { value: 30, unit: 'wt%' },
    filler: { value: 10, unit: 'wt%' },
    temp: { value: 120, unit: '°C' },
    time: { value: 60, unit: 'min' },
    substrate: { value: 'Aluminum' },
    ...parameterOverrides,
  },
  ...overrides,
});

const rowOf = (rows, key) => rows.find((row) => row.key === key);

test('units: normalizes common spellings', () => {
  assert.equal(normalizeUnit(' degC '), '°C');
  assert.equal(normalizeUnit('hr'), 'h');
  assert.equal(normalizeUnit('μm'), 'µm');
  assert.equal(normalizeUnit('furlong'), 'furlong');
  assert.equal(normalizeUnit(undefined), '');
});

test('units: converts within a dimension', () => {
  assert.ok(Math.abs(convert(393.15, 'K', '°C') - 120) < 1e-9);
  assert.equal(convert(2, 'h', 'min'), 120);
  assert.equal(convert(5000, 'ppm', 'wt%'), 0.5);
  assert.equal(convert(1.5, 'bar', 'kPa'), 150);
});

test('units: refuses conversions across dimensions or unknown units', () => {
  assert.equal(convert(1, 'min', '°C'), null);
  assert.equal(convert(1, 'µm', 'mm'), null);
  assert.equal(convert(50, '%RH', '%RH'), 50);
});

test('units: parses numbers and quantities', () => {
  assert.equal(parseNumber(' 120.5 '), 120.5);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
  assert.deepEqual(parseQuantity('120 degC'), { value: 120, unit: '°C' });
  assert.deepEqual(parseQuantity('45min'), { value: 45, unit: 'min' });
  assert.equal(parseQuantity('about 5'), null);
});

test('compare: categorical values ignore case and extra spaces', () => {
  const rows = buildComparison(schema, record('a'), record('b', {}, { substrate: { value: '  aluminum ' } }));
  assert.equal(rowOf(rows, 'substrate').status, STATUS.MATCH);
});

test('compare: numeric value inside absolute tolerance matches', () => {
  const rows = buildComparison(schema, record('a', {}, { temp: { value: 122, unit: '°C' } }), record('b'));
  assert.equal(rowOf(rows, 'temp').status, STATUS.MATCH);
});

test('compare: numeric value outside absolute tolerance does not match', () => {
  const rows = buildComparison(schema, record('a', {}, { temp: { value: 126, unit: '°C' } }), record('b'));
  assert.equal(rowOf(rows, 'temp').status, STATUS.MISMATCH);
});

test('compare: value exactly on the tolerance boundary matches', () => {
  const rows = buildComparison(schema, record('a', {}, { temp: { value: 125, unit: '°C' } }), record('b'));
  assert.equal(rowOf(rows, 'temp').status, STATUS.MATCH);
});

test('compare: units are converted before the tolerance is applied', () => {
  // 395.15 K is 122 °C, which is within ±5 °C of 120 °C.
  const kelvin = buildComparison(schema, record('a', {}, { temp: { value: 395.15, unit: 'K' } }), record('b'));
  assert.equal(rowOf(kelvin, 'temp').status, STATUS.MATCH);
  // 1 h is 60 min.
  const hours = buildComparison(schema, record('a', {}, { time: { value: 1, unit: 'h' } }), record('b'));
  assert.equal(rowOf(hours, 'time').status, STATUS.MATCH);
});

test('compare: percent tolerance uses the larger magnitude', () => {
  const inside = buildComparison(schema, record('a', {}, { time: { value: 66, unit: 'min' } }), record('b'));
  assert.equal(rowOf(inside, 'time').status, STATUS.MATCH);
  const outside = buildComparison(schema, record('a', {}, { time: { value: 70, unit: 'min' } }), record('b'));
  assert.equal(rowOf(outside, 'time').status, STATUS.MISMATCH);
});

test('compare: a value on one side only is not comparable, not a mismatch', () => {
  const rows = buildComparison(schema, record('a', {}, { filler: undefined }), record('b'));
  assert.equal(rowOf(rows, 'filler').status, STATUS.NOT_COMPARABLE);
});

test('compare: units that cannot be converted are not comparable', () => {
  const rows = buildComparison(schema, record('a', {}, { temp: { value: 120, unit: 'min' } }), record('b'));
  assert.equal(rowOf(rows, 'temp').status, STATUS.NOT_COMPARABLE);
});

test('compare: the table always has System, Method and every schema field', () => {
  const rows = buildComparison(schema, record('a'), record('b'));
  assert.deepEqual(rows.map((row) => row.key), ['system', 'method', 'resin', 'hardener', 'filler', 'temp', 'time', 'substrate']);
  assert.equal(rowOf(rows, 'temp').newValue, '120 °C');
  assert.equal(rowOf(rows, 'temp').tolerance, '±5 °C');
});

test('score: not comparable rows are left out of the denominator', () => {
  const rows = [
    { weight: 2, status: STATUS.MATCH },
    { weight: 1, status: STATUS.MISMATCH },
    { weight: 5, status: STATUS.NOT_COMPARABLE },
  ];
  const result = scoreRows(rows);
  assert.ok(Math.abs(result.score - 2 / 3) < 1e-9);
  assert.ok(Math.abs(result.coverage - 3 / 8) < 1e-9);
  assert.deepEqual([result.matched, result.mismatched, result.notComparable], [1, 1, 1]);
});

test('score: nothing comparable gives no score and verdict New', () => {
  const result = scoreRows([{ weight: 1, status: STATUS.NOT_COMPARABLE }]);
  assert.equal(result.score, null);
  assert.equal(verdictFor(result.score, result.coverage, schema.thresholds), VERDICT.NEW);
});

test('verdict: demo scene 1, cure temperature 2 °C apart is a Duplicate', () => {
  const result = evaluatePair(schema, record('new', {}, { temp: { value: 122, unit: '°C' } }), record('old'));
  assert.equal(result.score, 1);
  assert.equal(result.verdict, VERDICT.DUPLICATE);
});

test('verdict: demo scene 3, changing filler loading drops to Similar', () => {
  const result = evaluatePair(schema, record('new', {}, { filler: { value: 20, unit: 'wt%' } }), record('old'));
  assert.ok(result.score < 0.95 && result.score >= 0.6);
  assert.equal(result.verdict, VERDICT.SIMILAR);
});

test('verdict: a different system and method is New', () => {
  const other = record('old', { system: 'Lignin-phenolic LP-10', method: 'Peel test' }, {
    resin: { value: 'Lignin phenolic' },
    substrate: { value: 'Steel' },
    temp: { value: 160, unit: '°C' },
  });
  assert.equal(evaluatePair(schema, record('new'), other).verdict, VERDICT.NEW);
});

test('verdict: full score with too little compared is only Similar', () => {
  const sparse = { id: 'old', system: 'Bio-epoxy BE-200', method: '', parameters: {} };
  const result = evaluatePair(schema, record('new'), sparse);
  assert.equal(result.score, 1);
  assert.equal(result.lowCoverage, true);
  assert.equal(result.verdict, VERDICT.SIMILAR);
});

test('verdict: thresholds from the schema are respected', () => {
  const loose = { ...schema, thresholds: { duplicate: 0.85, similar: 0.5, minCoverage: 0.6 } };
  const result = evaluatePair(loose, record('new', {}, { filler: { value: 20, unit: 'wt%' } }), record('old'));
  assert.equal(result.verdict, VERDICT.DUPLICATE);
});

test('findPriorRuns: skips the record itself, drops New, sorts best first', () => {
  const candidates = [
    record('similar', {}, { filler: { value: 20, unit: 'wt%' } }),
    record('self'),
    record('duplicate', {}, { temp: { value: 118, unit: '°C' } }),
    record('unrelated', { system: 'Lignin-phenolic LP-10', method: 'Peel test' }, { resin: { value: 'Lignin phenolic' }, substrate: { value: 'Steel' } }),
  ];
  const result = findPriorRuns(schema, record('self'), candidates);
  assert.equal(result.verdict, VERDICT.DUPLICATE);
  assert.equal(result.checked, 3);
  assert.deepEqual(result.matches.map((match) => match.record.id), ['duplicate', 'similar']);
});

test('findPriorRuns: no candidates gives New with no matches', () => {
  const result = findPriorRuns(schema, record('self'), []);
  assert.equal(result.verdict, VERDICT.NEW);
  assert.deepEqual(result.matches, []);
});

test('findPriorRuns: an experiment is not a duplicate of one that came later', () => {
  const lastYear = record('old', { performedOn: '2025-11-01' });
  const reproduction = record('repro', { createdAt: '2026-11-10T09:00:00.000Z' });
  // The old run is checked: the later reproduction is not a prior run of it.
  assert.equal(findPriorRuns(schema, lastYear, [reproduction]).verdict, VERDICT.NEW);
  // The reproduction is checked: the old run is its prior run.
  assert.equal(findPriorRuns(schema, reproduction, [lastYear]).verdict, VERDICT.DUPLICATE);
});

test('findPriorRuns: a what-if question without dates is compared with everything', () => {
  const question = { system: 'Bio-epoxy BE-200', method: 'Lap shear test', parameters: record('x').parameters };
  const result = findPriorRuns(schema, question, [record('a', { performedOn: '2025-11-01' }), record('b', { createdAt: '2026-11-10T09:00:00.000Z' })]);
  assert.equal(result.matches.length, 2);
});