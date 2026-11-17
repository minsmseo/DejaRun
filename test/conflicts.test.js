import test from 'node:test';
import assert from 'node:assert/strict';

import { conflictsAround, findConflicts } from '../src/engine/conflicts.js';
import { EXAMPLE_SCHEMAS, sanitizeSchema } from '../src/domain/schema.js';

const schema = sanitizeSchema(EXAMPLE_SCHEMAS.adhesive.schema, { projectId: '1', projectKey: 'BAF' }).schema;

const record = (id, outcome, performedOn, parameterOverrides = {}, overrides = {}) => ({
  id,
  outcome,
  performedOn,
  system: 'Bio-epoxy BE-310',
  method: 'Lap shear test',
  parameters: {
    resin_type: { value: 'Epoxidized linseed oil' },
    hardener_ratio: { value: 28, unit: 'wt%' },
    filler_loading: { value: 8, unit: 'wt%' },
    cure_temperature: { value: 130, unit: '°C' },
    cure_time: { value: 50, unit: 'min' },
    substrate: { value: 'Aluminum' },
    ...parameterOverrides,
  },
  ...overrides,
});

test('conflicts: same conditions with opposite results are found, earlier run first', () => {
  const later = record('later', 'failed', '2026-09-01', { cure_temperature: { value: 128, unit: '°C' } });
  const earlier = record('earlier', 'success', '2026-06-01');
  const conflicts = findConflicts(schema, [later, earlier]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].first.id, 'earlier');
  assert.equal(conflicts[0].second.id, 'later');
  assert.equal(conflicts[0].evidence.daysApart, 92);
});

test('conflicts: evidence lists what is close but not identical and what only one side recorded', () => {
  const earlier = record('earlier', 'success', '2026-06-01');
  const later = record('later', 'failed', '2026-09-01', { cure_temperature: { value: 128, unit: '°C' }, filler_loading: undefined });
  const [conflict] = findConflicts(schema, [earlier, later]);
  assert.deepEqual(conflict.evidence.closeButNotIdentical.map((item) => item.condition), ['Cure temperature']);
  assert.equal(conflict.evidence.closeButNotIdentical[0].first, '130 °C');
  assert.equal(conflict.evidence.closeButNotIdentical[0].second, '128 °C');
  assert.deepEqual(conflict.evidence.recordedOnOneSideOnly.map((item) => item.condition), ['Filler loading']);
  assert.deepEqual(conflict.evidence.different, []);
});

test('conflicts: the same result, or different conditions, is not a conflict', () => {
  const a = record('a', 'success', '2026-06-01');
  assert.deepEqual(findConflicts(schema, [a, record('b', 'success', '2026-07-01')]), []);
  assert.deepEqual(findConflicts(schema, [a, record('c', 'failed', '2026-07-01', { cure_temperature: { value: 160, unit: '°C' }, substrate: { value: 'Steel' } })]), []);
});

test('conflicts: planned and inconclusive runs cannot disagree', () => {
  const a = record('a', 'success', '2026-06-01');
  assert.deepEqual(findConflicts(schema, [a, record('b', 'planned', ''), record('c', 'inconclusive', '2026-07-01')]), []);
});

test('conflictsAround: a planned experiment sees the disagreement among its duplicates', () => {
  const planned = record('new', 'planned', '', {}, { createdAt: '2026-11-17T00:00:00.000Z' });
  const success = record('ok', 'success', '2026-06-01');
  const failed = record('bad', 'failed', '2026-09-01');
  const unrelated = record('other', 'failed', '2026-08-01', { substrate: { value: 'Steel' }, cure_temperature: { value: 160, unit: '°C' } });
  const conflicts = conflictsAround(schema, planned, [planned, success, failed, unrelated]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual([conflicts[0].first.id, conflicts[0].second.id], ['ok', 'bad']);
});
