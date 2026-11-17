import test from 'node:test';
import assert from 'node:assert/strict';

import { matchesFilters, parseFilters } from '../src/engine/filter.js';
import { EXAMPLE_SCHEMAS, sanitizeSchema } from '../src/domain/schema.js';

const schema = sanitizeSchema(EXAMPLE_SCHEMAS.adhesive.schema, { projectId: '1', projectKey: 'BAF' }).schema;

const record = (temperature, unit, substrate, outcome = 'success') => ({
  system: 'Bio-epoxy BE-200',
  method: 'Lap shear test',
  outcome,
  parameters: { cure_temperature: { value: temperature, unit }, substrate: { value: substrate } },
});

test('filters: the demo question, above 120 °C on aluminum', () => {
  const { filters, problems } = parseFilters('Cure temperature > 120 °C; Substrate = aluminum', schema);
  assert.deepEqual(problems, []);
  assert.equal(matchesFilters(record(150, '°C', 'Aluminum'), filters), true);
  assert.equal(matchesFilters(record(120, '°C', 'Aluminum'), filters), false);
  assert.equal(matchesFilters(record(150, '°C', 'Steel'), filters), false);
});

test('filters: units are converted on both sides', () => {
  const { filters } = parseFilters('Cure temperature >= 393.15 K', schema);
  assert.equal(matchesFilters(record(120, '°C', 'Steel'), filters), true);
  assert.equal(matchesFilters(record(403.15, 'K', 'Steel'), filters), true);
  assert.equal(matchesFilters(record(100, '°C', 'Steel'), filters), false);
});

test('filters: fixed fields and not-equal', () => {
  const { filters, problems } = parseFilters('System = bio-epoxy be-200\nOutcome != success', schema);
  assert.deepEqual(problems, []);
  assert.equal(matchesFilters(record(120, '°C', 'Steel', 'failed'), filters), true);
  assert.equal(matchesFilters(record(120, '°C', 'Steel', 'success'), filters), false);
});

test('filters: a record without the filtered value does not match', () => {
  const { filters } = parseFilters('Filler loading < 5 wt%', schema);
  assert.equal(matchesFilters(record(120, '°C', 'Steel'), filters), false);
});

test('filters: problems are reported, not guessed', () => {
  const { filters, problems } = parseFilters('Colour = blue; Cure temperature > hot; Substrate > Steel; nonsense', schema);
  assert.equal(filters.length, 0);
  assert.equal(problems.length, 4);
});

test('filters: an empty text means no filters', () => {
  assert.deepEqual(parseFilters('', schema), { filters: [], problems: [] });
});
