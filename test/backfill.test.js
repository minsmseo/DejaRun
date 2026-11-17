import test from 'node:test';
import assert from 'node:assert/strict';

import { extractDetails, looksLikeExperiment, tablesFromAdf, tablesFromStorage } from '../src/backfill/parseTable.js';
import { sanitizeDetails } from '../src/domain/record.js';
import { EXAMPLE_SCHEMAS, sanitizeSchema } from '../src/domain/schema.js';

const schema = sanitizeSchema(EXAMPLE_SCHEMAS.adhesive.schema, { projectId: '1', projectKey: 'BAF' }).schema;

const keyValuePage = `
<p>Summary of run 14.</p>
<table><tbody>
<tr><th>Condition</th><th>Value</th></tr>
<tr><td>System</td><td>bio-epoxy be-200</td></tr>
<tr><td><p>Test method</p></td><td><p>Lap shear test</p></td></tr>
<tr><td>Resin type</td><td>Epoxidized soybean oil</td></tr>
<tr><td>Hardener ratio</td><td>30 wt%</td></tr>
<tr><td>Cure temperature</td><td>393.15 K</td></tr>
<tr><td>Cure time (h)</td><td>1</td></tr>
<tr><td>Substrate</td><td>Aluminum</td></tr>
<tr><td>Outcome</td><td>Failed</td></tr>
<tr><td>Run date</td><td>2026-03-14</td></tr>
<tr><td>Findings</td><td>Voids in the bond line &amp; low strength.</td></tr>
<tr><td>Operator mood</td><td>fine</td></tr>
</tbody></table>`;

test('storage: reads rows and cells, strips tags and decodes entities', () => {
  const tables = tablesFromStorage(keyValuePage);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0][0], ['Condition', 'Value']);
  assert.deepEqual(tables[0][2], ['Test method', 'Lap shear test']);
  assert.equal(tables[0][10][1], 'Voids in the bond line & low strength.');
});

test('extract: key/value table maps labels to schema fields', () => {
  const result = extractDetails(tablesFromStorage(keyValuePage), schema);
  assert.equal(result.details.system, 'Bio-epoxy BE-200'); // schema spelling restored
  assert.equal(result.details.method, 'Lap shear test');
  assert.deepEqual(result.details.parameters.hardener_ratio, { value: 30, unit: 'wt%' });
  assert.deepEqual(result.details.parameters.cure_temperature, { value: 393.15, unit: 'K' });
  assert.deepEqual(result.details.parameters.cure_time, { value: 1, unit: 'h' }); // unit from the label
  assert.equal(result.details.parameters.filler_loading, undefined);
  assert.equal(result.details.outcome, 'failed');
  assert.equal(result.details.performedOn, '2026-03-14');
  assert.equal(result.parameterCount, 5);
  assert.ok(looksLikeExperiment(result));
});

test('extract: result passes record validation', () => {
  const { details } = extractDetails(tablesFromStorage(keyValuePage), schema);
  const { problems } = sanitizeDetails(details, schema);
  assert.deepEqual(problems, []);
});

test('extract: header-row table is understood', () => {
  const page = `<table><tr><th>System</th><th>Method</th><th>Cure temperature (°C)</th><th>Substrate</th></tr>
    <tr><td>Bio-epoxy BE-310</td><td>Peel test</td><td>130</td><td>steel</td></tr></table>`;
  const result = extractDetails(tablesFromStorage(page), schema);
  assert.equal(result.details.system, 'Bio-epoxy BE-310');
  assert.deepEqual(result.details.parameters.cure_temperature, { value: 130, unit: '°C' });
  assert.equal(result.details.parameters.substrate.value, 'Steel');
});

test('extract: a page without matching labels is not offered', () => {
  const page = '<table><tr><th>Name</th><th>Role</th></tr><tr><td>Ilse</td><td>Chemist</td></tr></table>';
  const result = extractDetails(tablesFromStorage(page), schema);
  assert.equal(result.parameterCount, 0);
  assert.equal(looksLikeExperiment(result), false);
});

test('extract: a non-numeric value for a numeric field is skipped', () => {
  const page = '<table><tr><td>System</td><td>Bio-epoxy BE-200</td></tr><tr><td>Cure temperature</td><td>room temperature</td></tr><tr><td>Substrate</td><td>Steel</td></tr></table>';
  const result = extractDetails(tablesFromStorage(page), schema);
  assert.equal(result.details.parameters.cure_temperature, undefined);
  assert.equal(result.parameterCount, 1);
});

test('adf: reads tables from a Jira description', () => {
  const cell = (text) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const document = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Planned run' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [cell('System'), cell('Bio-epoxy BE-200')] }, { type: 'tableRow', content: [cell('Filler loading'), cell('10 wt%')] }] },
    ],
  };
  const result = extractDetails(tablesFromAdf(document), schema);
  assert.equal(result.details.system, 'Bio-epoxy BE-200');
  assert.deepEqual(result.details.parameters.filler_loading, { value: 10, unit: 'wt%' });
});
