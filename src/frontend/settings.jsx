import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  DynamicTable,
  EmptyState,
  Heading,
  HelperMessage,
  Inline,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage,
  Select,
  Stack,
  Text,
  TextArea,
  Textfield,
  xcss,
} from '@forge/react';
import { call, cardStyle, ErrorBanner, Loading, Page } from './shared';

/**
 * Project settings: the parameter schema. A project administrator defines
 * which conditions describe an experiment in this project, how close two
 * numeric values must be to count as the same, and when a similarity score
 * means Duplicate or Similar.
 */

const fieldStyle = xcss({ width: '260px' });
const narrowStyle = xcss({ width: '120px' });
const wideStyle = xcss({ width: '420px' });

const TYPE_OPTIONS = [
  { label: 'Numeric (compared with a tolerance)', value: 'numeric' },
  { label: 'Categorical (must be the same value)', value: 'categorical' },
];
const MODE_OPTIONS = [
  { label: 'Absolute (in the unit)', value: 'absolute' },
  { label: 'Percent', value: 'percent' },
];

const lines = (list) => (list || []).join('\n');
const fromLines = (value) => String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
const toPercent = (value) => String(Math.round(Number(value) * 1000) / 10);
const fromPercent = (value) => Number(String(value).trim()) / 100;

/** The settings form keeps everything as text so half-typed numbers are not lost. */
const toForm = (schema) => ({
  systems: lines(schema.systems),
  methods: lines(schema.methods),
  systemWeight: String(schema.weights?.system ?? 3),
  methodWeight: String(schema.weights?.method ?? 2),
  duplicate: toPercent(schema.thresholds?.duplicate ?? 0.95),
  similar: toPercent(schema.thresholds?.similar ?? 0.6),
  minCoverage: toPercent(schema.thresholds?.minCoverage ?? 0.6),
  spaceKey: schema.spaceKey || '',
  fields: (schema.fields || []).map((field) => ({
    key: field.key,
    name: field.name,
    type: field.type,
    unit: field.unit || '',
    toleranceMode: field.tolerance?.mode || 'absolute',
    toleranceValue: String(field.tolerance?.value ?? 0),
    weight: String(field.weight ?? 1),
    options: lines(field.options),
  })),
});

const fromForm = (form) => ({
  systems: fromLines(form.systems),
  methods: fromLines(form.methods),
  weights: { system: form.systemWeight, method: form.methodWeight },
  thresholds: { duplicate: fromPercent(form.duplicate), similar: fromPercent(form.similar), minCoverage: fromPercent(form.minCoverage) },
  spaceKey: form.spaceKey,
  fields: form.fields.map((field) => ({
    key: field.key,
    name: field.name,
    type: field.type,
    unit: field.unit,
    tolerance: { mode: field.toleranceMode, value: field.toleranceValue },
    weight: field.weight,
    options: fromLines(field.options),
  })),
});

const blankField = () => ({ key: '', name: '', type: 'numeric', unit: '', toleranceMode: 'absolute', toleranceValue: '0', weight: '1', options: '' });

const describeTolerance = (field) => {
  if (field.type !== 'numeric') return 'Same value';
  const value = Number(field.toleranceValue);
  if (!Number.isFinite(value) || value <= 0) return 'Exact';
  return field.toleranceMode === 'percent' ? `±${value}%` : `±${value}${field.unit ? ` ${field.unit}` : ''}`;
};

const LabeledField = ({ id, label, help, children }) => (
  <Stack space="space.050">
    <Label labelFor={id}>{label}</Label>
    {children}
    {help && <HelperMessage>{help}</HelperMessage>}
  </Stack>
);

/** Add or edit one parameter. */
const FieldModal = ({ initial, isNew, onSave, onClose }) => {
  const [draft, setDraft] = useState(initial);
  const [problem, setProblem] = useState('');
  const set = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  const numeric = draft.type === 'numeric';

  const save = () => {
    if (!draft.name.trim()) {
      setProblem('Give the parameter a name.');
      return;
    }
    if (!Number.isFinite(Number(draft.weight)) || Number(draft.weight) < 0) {
      setProblem('The weight must be a number of zero or more.');
      return;
    }
    if (numeric && (!Number.isFinite(Number(draft.toleranceValue)) || Number(draft.toleranceValue) < 0)) {
      setProblem('The tolerance must be a number of zero or more.');
      return;
    }
    onSave(draft);
  };

  return (
    <Modal onClose={onClose} width="medium">
      <ModalHeader>
        <ModalTitle>{isNew ? 'Add parameter' : 'Edit parameter'}</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.200">
          <ErrorBanner title="This parameter is not complete" message={problem} />
          <LabeledField id="field-name" label="Name">
            <Textfield id="field-name" value={draft.name} placeholder="Cure temperature" onChange={set('name')} />
          </LabeledField>
          <LabeledField id="field-type" label="Type">
            <Select
              inputId="field-type"
              options={TYPE_OPTIONS}
              value={TYPE_OPTIONS.find((option) => option.value === draft.type)}
              onChange={(option) => setDraft({ ...draft, type: option.value })}
            />
          </LabeledField>
          {numeric ? (
            <>
              <LabeledField id="field-unit" label="Unit" help="Values entered in °C or K, min or h, wt% or ppm, kPa or bar are converted before they are compared.">
                <Box xcss={narrowStyle}>
                  <Textfield id="field-unit" value={draft.unit} placeholder="°C" onChange={set('unit')} />
                </Box>
              </LabeledField>
              <Inline space="space.200" alignBlock="end">
                <LabeledField id="field-tolerance" label="Tolerance">
                  <Box xcss={narrowStyle}>
                    <Textfield id="field-tolerance" value={draft.toleranceValue} onChange={set('toleranceValue')} />
                  </Box>
                </LabeledField>
                <Box xcss={fieldStyle}>
                  <Select
                    inputId="field-mode"
                    options={MODE_OPTIONS}
                    value={MODE_OPTIONS.find((option) => option.value === draft.toleranceMode)}
                    onChange={(option) => setDraft({ ...draft, toleranceMode: option.value })}
                  />
                </Box>
              </Inline>
              <HelperMessage>Two values count as the same condition when their difference is within the tolerance. Use 0 for an exact match.</HelperMessage>
            </>
          ) : (
            <LabeledField id="field-options" label="Allowed values" help="One value per line. Leave empty to let researchers type any value.">
              <TextArea id="field-options" value={draft.options} placeholder={'Aluminum\nSteel'} onChange={set('options')} />
            </LabeledField>
          )}
          <LabeledField id="field-weight" label="Weight" help="How much this parameter counts in the similarity score. 0 leaves it out of the score.">
            <Box xcss={narrowStyle}>
              <Textfield id="field-weight" value={draft.weight} onChange={set('weight')} />
            </Box>
          </LabeledField>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button appearance="primary" onClick={save}>
            {isNew ? 'Add parameter' : 'Apply'}
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
};

const ConfirmModal = ({ title, body, confirmLabel, onConfirm, onClose }) => (
  <Modal onClose={onClose}>
    <ModalHeader>
      <ModalTitle appearance="warning">{title}</ModalTitle>
    </ModalHeader>
    <ModalBody>
      <Text>{body}</Text>
    </ModalBody>
    <ModalFooter>
      <ButtonGroup>
        <Button appearance="subtle" onClick={onClose}>
          Cancel
        </Button>
        <Button appearance="warning" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </ButtonGroup>
    </ModalFooter>
  </Modal>
);

const App = () => {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await call('getSettings');
      setSettings(data);
      setForm(data.schema ? toForm(data.schema) : null);
      setDirty(false);
    } catch (failure) {
      setLoadError(failure.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setDirty(true);
    setSaved(false);
  };
  const setText = (key) => (event) => update({ [key]: event.target.value });

  const start = async (source) => {
    setError('');
    setBusy(true);
    try {
      const schema = await call('getStartingSchema', { source });
      // Keep the linked space when an example replaces an existing schema.
      setForm({ ...toForm(schema), spaceKey: form?.spaceKey || '' });
      setDirty(true);
      setSaved(false);
    } catch (failure) {
      setError(failure.message);
    }
    setBusy(false);
    setConfirm(null);
  };

  const requestStart = (source, label) => {
    if (!form) {
      start(source);
      return;
    }
    setConfirm({
      title: 'Replace the current schema?',
      body: `The parameters, pick lists and thresholds on this screen will be replaced with ${label}. Nothing is saved until you choose Save schema. Experiment records keep the values they already have.`,
      confirmLabel: 'Replace',
      onConfirm: () => start(source),
    });
  };

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const schema = await call('saveSchema', { schema: fromForm(form) });
      setSettings((current) => ({ ...current, schema }));
      setForm(toForm(schema));
      setDirty(false);
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
    }
    setBusy(false);
  };

  const applyField = (field) => {
    const fields = [...form.fields];
    if (editing.index === null) fields.push(field);
    else fields[editing.index] = field;
    update({ fields });
    setEditing(null);
  };

  const removeField = (index) => {
    const field = form.fields[index];
    setConfirm({
      title: `Remove "${field.name}"?`,
      body: 'The parameter is removed from the schema and no longer compared. Values already saved in experiment records are kept but not shown.',
      confirmLabel: 'Remove parameter',
      onConfirm: () => {
        update({ fields: form.fields.filter((_, position) => position !== index) });
        setConfirm(null);
      },
    });
  };

  const moveField = (index, step) => {
    const fields = [...form.fields];
    const [field] = fields.splice(index, 1);
    fields.splice(index + step, 0, field);
    update({ fields });
  };

  if (loadError) {
    return (
      <Page>
        <ErrorBanner title="DejaRun settings could not be loaded" message={loadError} />
        <Inline>
          <Button onClick={load}>Try again</Button>
        </Inline>
      </Page>
    );
  }
  if (!settings) return <Loading label="Loading parameter schema" />;

  const { canEdit, examples } = settings;

  const exampleButtons = (
    <Inline space="space.100" shouldWrap>
      {examples.map((example) => (
        <Button key={example.id} isDisabled={busy} onClick={() => requestStart(example.id, `the "${example.label}" example`)}>
          {`Load example: ${example.label}`}
        </Button>
      ))}
    </Inline>
  );

  if (!form) {
    return (
      <Page>
        <ErrorBanner message={error} />
        <EmptyState
          header="This project has no parameter schema yet"
          description={
            canEdit
              ? 'A parameter schema lists the conditions that describe an experiment in this project, such as cure temperature or substrate. DejaRun uses it to compare a new experiment with past ones. Start from an example and adjust it, or start empty.'
              : 'Ask a project administrator to set up the parameter schema. Until then DejaRun cannot compare experiments in this project.'
          }
        />
        {canEdit && (
          <Stack space="space.100">
            {exampleButtons}
            <Inline>
              <Button appearance="subtle" isDisabled={busy} onClick={() => start('empty')}>
                Start with an empty schema
              </Button>
            </Inline>
          </Stack>
        )}
      </Page>
    );
  }

  const rows = form.fields.map((field, index) => ({
    key: field.key || `new-${index}`,
    cells: [
      { key: 'name', content: <Text weight="medium">{field.name}</Text> },
      { key: 'type', content: <Text>{field.type === 'numeric' ? 'Numeric' : 'Categorical'}</Text> },
      { key: 'unit', content: <Text>{field.type === 'numeric' ? field.unit || 'No unit' : fromLines(field.options).length ? `${fromLines(field.options).length} allowed values` : 'Any value'}</Text> },
      { key: 'tolerance', content: <Text>{describeTolerance(field)}</Text> },
      { key: 'weight', content: <Text>{field.weight}</Text> },
      {
        key: 'actions',
        content: canEdit ? (
          <ButtonGroup>
            <Button appearance="subtle" spacing="compact" isDisabled={index === 0} onClick={() => moveField(index, -1)}>
              Up
            </Button>
            <Button appearance="subtle" spacing="compact" isDisabled={index === form.fields.length - 1} onClick={() => moveField(index, 1)}>
              Down
            </Button>
            <Button appearance="subtle" spacing="compact" onClick={() => setEditing({ index, field })}>
              Edit
            </Button>
            <Button appearance="subtle" spacing="compact" onClick={() => removeField(index)}>
              Remove
            </Button>
          </ButtonGroup>
        ) : null,
      },
    ],
  }));

  return (
    <Page>
      {!canEdit && (
        <SectionMessage appearance="information" title="View only">
          <Text>Only project administrators can change the parameter schema.</Text>
        </SectionMessage>
      )}
      <ErrorBanner title="The schema could not be saved" message={error} />
      {saved && !dirty && (
        <SectionMessage appearance="success" title="Schema saved">
          <Text>Open a work item in this project and add the DejaRun panel to register an experiment.</Text>
        </SectionMessage>
      )}
      {dirty && (
        <SectionMessage appearance="warning" title="Unsaved changes">
          <Text>Choose Save schema to apply your changes.</Text>
        </SectionMessage>
      )}

      <Box xcss={cardStyle}>
        <Stack space="space.200">
          <Heading as="h3">System and method</Heading>
          <Text>Every experiment has a system (the material system or product under test) and a test method. Both are compared as exact values.</Text>
          <Inline space="space.300" alignBlock="start" shouldWrap>
            <LabeledField id="systems" label="Systems" help="One per line. Leave empty to let researchers type any system.">
              <Box xcss={fieldStyle}>
                <TextArea id="systems" value={form.systems} isDisabled={!canEdit} onChange={setText('systems')} />
              </Box>
            </LabeledField>
            <LabeledField id="methods" label="Test methods" help="One per line. Leave empty to allow any method.">
              <Box xcss={fieldStyle}>
                <TextArea id="methods" value={form.methods} isDisabled={!canEdit} onChange={setText('methods')} />
              </Box>
            </LabeledField>
            <LabeledField id="system-weight" label="System weight">
              <Box xcss={narrowStyle}>
                <Textfield id="system-weight" value={form.systemWeight} isDisabled={!canEdit} onChange={setText('systemWeight')} />
              </Box>
            </LabeledField>
            <LabeledField id="method-weight" label="Method weight">
              <Box xcss={narrowStyle}>
                <Textfield id="method-weight" value={form.methodWeight} isDisabled={!canEdit} onChange={setText('methodWeight')} />
              </Box>
            </LabeledField>
          </Inline>
        </Stack>
      </Box>

      <Box xcss={cardStyle}>
        <Stack space="space.200">
          <Heading as="h3">Parameters</Heading>
          <DynamicTable
            head={{
              cells: [
                { key: 'name', content: 'Parameter', width: 24 },
                { key: 'type', content: 'Type', width: 14 },
                { key: 'unit', content: 'Unit or values', width: 16 },
                { key: 'tolerance', content: 'Counts as the same when', width: 16 },
                { key: 'weight', content: 'Weight', width: 8 },
                { key: 'actions', content: '', width: 22 },
              ],
            }}
            rows={rows}
            emptyView={<Text>No parameters yet. Add the conditions that describe an experiment in this project.</Text>}
          />
          {canEdit && (
            <Inline>
              <Button onClick={() => setEditing({ index: null, field: blankField() })}>Add parameter</Button>
            </Inline>
          )}
        </Stack>
      </Box>

      <Box xcss={cardStyle}>
        <Stack space="space.200">
          <Heading as="h3">Verdict thresholds</Heading>
          <Text>
            The similarity score is the weighted share of compared fields that match. Fields that only one experiment has a value for are left out of the score.
          </Text>
          <Inline space="space.300" alignBlock="start" shouldWrap>
            <LabeledField id="duplicate" label="Duplicate at or above (%)">
              <Box xcss={narrowStyle}>
                <Textfield id="duplicate" value={form.duplicate} isDisabled={!canEdit} onChange={setText('duplicate')} />
              </Box>
            </LabeledField>
            <LabeledField id="similar" label="Similar at or above (%)">
              <Box xcss={narrowStyle}>
                <Textfield id="similar" value={form.similar} isDisabled={!canEdit} onChange={setText('similar')} />
              </Box>
            </LabeledField>
            <LabeledField id="coverage" label="Minimum compared share for Duplicate (%)" help="If less of the schema than this could be compared, a full score is reported as Similar instead of Duplicate.">
              <Box xcss={narrowStyle}>
                <Textfield id="coverage" value={form.minCoverage} isDisabled={!canEdit} onChange={setText('minCoverage')} />
              </Box>
            </LabeledField>
          </Inline>
        </Stack>
      </Box>

      <Box xcss={cardStyle}>
        <Stack space="space.200">
          <Heading as="h3">Experiment reports in Confluence</Heading>
          <LabeledField id="space-key" label="Confluence space key" help="Past experiments that only exist as report pages in this space can be imported from the DejaRun project page.">
            <Box xcss={fieldStyle}>
              <Textfield id="space-key" value={form.spaceKey} placeholder="e.g. BAF" isDisabled={!canEdit} onChange={setText('spaceKey')} />
            </Box>
          </LabeledField>
        </Stack>
      </Box>

      {canEdit && (
        <Stack space="space.200">
          <Inline space="space.100">
            <Button appearance="primary" isDisabled={!dirty} isLoading={busy} onClick={save}>
              Save schema
            </Button>
            <Button appearance="subtle" isDisabled={!dirty || busy} onClick={load}>
              Discard changes
            </Button>
          </Inline>
          <Box xcss={wideStyle}>
            <Text size="small">Replace this schema with a built-in example:</Text>
          </Box>
          {exampleButtons}
        </Stack>
      )}

      <ModalTransition>
        {editing && <FieldModal initial={editing.field} isNew={editing.index === null} onSave={applyField} onClose={() => setEditing(null)} />}
        {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
      </ModalTransition>
    </Page>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
