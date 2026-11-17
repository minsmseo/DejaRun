import React, { useCallback, useEffect, useRef, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  DatePicker,
  DynamicTable,
  Heading,
  HelperMessage,
  Inline,
  Label,
  Link,
  Lozenge,
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
  useProductContext,
  xcss,
} from '@forge/react';
import { requestTeamworkGraph } from '@forge/bridge';
import { getRunContext } from '../clients/twg.js';
import { unitChoices } from '../domain/record.js';
import { call, cardStyle, ErrorBanner, formatDate, Loading, OUTCOME_LABEL, OutcomeLozenge, Page, percent, VerdictLozenge } from './shared';

/**
 * Issue panel. A researcher registers the conditions of the experiment this
 * work item stands for; DejaRun then shows prior runs with the same or
 * similar conditions, compared field by field, and records the decision:
 * link as a repeat, or proceed with a reason.
 */

const fieldStyle = xcss({ width: '240px' });
const narrowStyle = xcss({ width: '110px' });

const OUTCOME_OPTIONS = ['planned', 'success', 'failed', 'inconclusive'].map((value) => ({ label: OUTCOME_LABEL[value], value }));
const STATUS_LOZENGE = {
  match: { appearance: 'success', label: 'Match' },
  mismatch: { appearance: 'removed', label: 'Different' },
  not_comparable: { appearance: 'default', label: 'Not comparable' },
};

const toOptions = (values) => (values || []).map((value) => ({ label: value, value }));

/**
 * UI Kit text inputs report their value a moment after the last keystroke.
 * A person who types and immediately clicks a button would otherwise submit
 * the value from before that keystroke. Buttons that submit typed text wait
 * this long and then read the latest value from a ref.
 */
const INPUT_SETTLE_MS = 300;
const settle = () => new Promise((resolve) => setTimeout(resolve, INPUT_SETTLE_MS));

/** Form state is text only, so a half-typed number is never lost. */
const toForm = (record, schema) => ({
  objective: record?.objective || '',
  objectiveTag: record?.objectiveTag || '',
  system: record?.system || '',
  method: record?.method || '',
  outcome: record?.outcome || 'planned',
  findings: record?.findings || '',
  performedOn: record?.performedOn || '',
  reportUrl: record?.report?.url || '',
  values: Object.fromEntries(schema.fields.map((field) => [field.key, String(record?.parameters?.[field.key]?.value ?? '')])),
  units: Object.fromEntries(schema.fields.map((field) => [field.key, record?.parameters?.[field.key]?.unit || field.unit || ''])),
});

const fromForm = (form, schema) => ({
  objective: form.objective,
  objectiveTag: form.objectiveTag,
  system: form.system,
  method: form.method,
  outcome: form.outcome,
  findings: form.findings,
  performedOn: form.performedOn,
  report: { url: form.reportUrl },
  parameters: Object.fromEntries(schema.fields.map((field) => [field.key, { value: form.values[field.key], unit: form.units[field.key] }])),
});

const LabeledField = ({ id, label, help, children }) => (
  <Stack space="space.050">
    <Label labelFor={id}>{label}</Label>
    {children}
    {help && <HelperMessage>{help}</HelperMessage>}
  </Stack>
);

/** A pick list when the schema defines allowed values, otherwise free text. */
const ChoiceField = ({ id, label, options, value, placeholder, onChange }) => (
  <LabeledField id={id} label={label}>
    <Box xcss={fieldStyle}>
      {options.length ? (
        <Select
          inputId={id}
          options={toOptions(options)}
          value={value ? { label: value, value } : null}
          placeholder={placeholder || 'Choose'}
          isClearable
          onChange={(option) => onChange(option ? option.value : '')}
        />
      ) : (
        <Textfield id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
    </Box>
  </LabeledField>
);

const NumericField = ({ field, value, unit, onValue, onUnit }) => {
  const units = unitChoices(field.unit);
  return (
    <LabeledField id={`p-${field.key}`} label={field.unit && units.length <= 1 ? `${field.name} (${field.unit})` : field.name}>
      <Inline space="space.100" alignBlock="center">
        <Box xcss={narrowStyle}>
          <Textfield id={`p-${field.key}`} value={value} onChange={(event) => onValue(event.target.value)} />
        </Box>
        {units.length > 1 && (
          <Box xcss={narrowStyle}>
            <Select inputId={`u-${field.key}`} options={toOptions(units)} value={{ label: unit, value: unit }} onChange={(option) => onUnit(option.value)} />
          </Box>
        )}
      </Inline>
    </LabeledField>
  );
};

const RegistrationForm = ({ schema, record, busy, error, onSave, onCancel }) => {
  const [form, setForm] = useState(() => toForm(record, schema));
  const [settling, setSettling] = useState(false);
  const latest = useRef(form);
  latest.current = form;
  const save = async () => {
    setSettling(true);
    await settle();
    setSettling(false);
    onSave(fromForm(latest.current, schema));
  };
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const setEvent = (key) => (event) => set(key)(event.target.value);
  const setValue = (key) => (value) => setForm((current) => ({ ...current, values: { ...current.values, [key]: value } }));
  const setUnit = (key) => (value) => setForm((current) => ({ ...current, units: { ...current.units, [key]: value } }));

  return (
    <Stack space="space.200">
      <Heading as="h4">{record ? 'Edit experiment conditions' : 'Register this experiment'}</Heading>
      {!record && <Text>Enter the planned conditions. DejaRun checks them against past experiments in this project as soon as you save.</Text>}
      <ErrorBanner title="The experiment could not be saved" message={error} />

      <LabeledField id="objective" label="Objective">
        <Textfield id="objective" value={form.objective} placeholder="What is this experiment meant to show?" onChange={setEvent('objective')} />
      </LabeledField>

      <Inline space="space.200" alignBlock="start" shouldWrap>
        <ChoiceField id="system" label="System" options={schema.systems} value={form.system} placeholder="Material system or product" onChange={set('system')} />
        <ChoiceField id="method" label="Test method" options={schema.methods} value={form.method} onChange={set('method')} />
        <LabeledField id="objective-tag" label="Objective tag">
          <Box xcss={fieldStyle}>
            <Textfield id="objective-tag" value={form.objectiveTag} placeholder="e.g. screening" onChange={setEvent('objectiveTag')} />
          </Box>
        </LabeledField>
      </Inline>

      <Inline space="space.200" alignBlock="start" shouldWrap>
        {schema.fields.map((field) =>
          field.type === 'numeric' ? (
            <NumericField key={field.key} field={field} value={form.values[field.key]} unit={form.units[field.key]} onValue={setValue(field.key)} onUnit={setUnit(field.key)} />
          ) : (
            <ChoiceField key={field.key} id={`p-${field.key}`} label={field.name} options={field.options || []} value={form.values[field.key]} onChange={setValue(field.key)} />
          )
        )}
      </Inline>

      <Inline space="space.200" alignBlock="start" shouldWrap>
        <LabeledField id="outcome" label="Outcome">
          <Box xcss={fieldStyle}>
            <Select inputId="outcome" options={OUTCOME_OPTIONS} value={OUTCOME_OPTIONS.find((option) => option.value === form.outcome)} onChange={(option) => set('outcome')(option.value)} />
          </Box>
        </LabeledField>
        <LabeledField id="performed-on" label="Run date">
          <DatePicker id="performed-on" value={form.performedOn || undefined} onChange={(value) => set('performedOn')(value || '')} />
        </LabeledField>
        <LabeledField id="report-url" label="Report link">
          <Box xcss={fieldStyle}>
            <Textfield id="report-url" value={form.reportUrl} placeholder="https://..." onChange={setEvent('reportUrl')} />
          </Box>
        </LabeledField>
      </Inline>

      <LabeledField id="findings" label="Findings" help="One or two sentences. For a failed experiment, say why it failed. This is what the next researcher will read.">
        <TextArea id="findings" value={form.findings} onChange={setEvent('findings')} />
      </LabeledField>

      <ButtonGroup>
        <Button appearance="primary" isLoading={busy || settling} onClick={save}>
          {record ? 'Save and check again' : 'Save and check for prior runs'}
        </Button>
        {onCancel && (
          <Button appearance="subtle" isDisabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </ButtonGroup>
    </Stack>
  );
};

/** The saved conditions of this work item, in one compact block. */
const RecordSummary = ({ record, schema }) => {
  const conditions = schema.fields
    .map((field) => {
      const entry = record.parameters[field.key];
      if (entry === undefined || entry.value === '' || entry.value === null) return null;
      return `${field.name}: ${entry.value}${entry.unit ? ` ${entry.unit}` : ''}`;
    })
    .filter(Boolean);
  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Text weight="bold">{record.system}</Text>
        <Text>{record.method}</Text>
        <OutcomeLozenge outcome={record.outcome} />
        {record.objectiveTag && <Lozenge>{record.objectiveTag}</Lozenge>}
      </Inline>
      {record.objective && <Text>{record.objective}</Text>}
      <Text>{conditions.length ? conditions.join(' · ') : 'No conditions entered yet.'}</Text>
      {record.findings && <Text>{`Findings: ${record.findings}`}</Text>}
    </Stack>
  );
};

const ComparisonTable = ({ rows }) => (
  <DynamicTable
    head={{
      cells: [
        { key: 'name', content: 'Condition', width: 20 },
        { key: 'new', content: 'This experiment', width: 20 },
        { key: 'prior', content: 'Prior run', width: 20 },
        { key: 'status', content: 'Result', width: 14 },
        { key: 'note', content: 'Why', width: 26 },
      ],
    }}
    rows={rows.map((row) => {
      const status = STATUS_LOZENGE[row.status] || STATUS_LOZENGE.not_comparable;
      return {
        key: row.key,
        cells: [
          { key: 'name', content: <Text weight="medium">{row.name}</Text> },
          { key: 'new', content: <Text>{row.newValue || '(none)'}</Text> },
          { key: 'prior', content: <Text>{row.priorValue || '(none)'}</Text> },
          { key: 'status', content: <Lozenge appearance={status.appearance}>{status.label}</Lozenge> },
          { key: 'note', content: <Text size="small">{row.note}</Text> },
        ],
      };
    })}
  />
);

/**
 * "Ask the people who ran it": the owner of the prior run, who wrote its
 * report, and what they are working on now. The people behind a report page
 * and their current work come from the Teamwork Graph, read as the current
 * user. If the graph cannot be read the area is left out; the owner from
 * Jira is still shown in the line above.
 */
const RunPeople = ({ match, cloudId }) => {
  const [context, setContext] = useState(null);

  useEffect(() => {
    let live = true;
    getRunContext(requestTeamworkGraph, { cloudId, ownerId: match.ownerId, ownerName: match.owner, reportPageId: match.report?.pageId })
      .then((result) => live && setContext(result))
      .catch(() => live && setContext({ available: false, people: [] }));
    return () => {
      live = false;
    };
  }, [match.recordId, cloudId]);

  if (!context) return <Text size="small">Looking up the people behind this run...</Text>;
  if (!context.available || context.people.length === 0) return null;

  return (
    <Stack space="space.100">
      <Text weight="bold">Ask the people who ran it</Text>
      {context.people.map((person) => (
        <Stack key={person.accountId} space="space.050">
          <Text>{`${person.name || 'A person whose name you cannot see'} · ${person.roles.join(', ')}`}</Text>
          {person.openWork && person.openWork.items.length > 0 && (
            <Inline space="space.100" shouldWrap>
              <Text size="small">Working on now:</Text>
              {person.openWork.items.map((item) => (
                <Link key={item.key} href={item.url} openNewTab>
                  {`${item.key} ${item.summary}`}
                </Link>
              ))}
              {person.openWork.more && <Text size="small">and more</Text>}
            </Inline>
          )}
          {person.openWork && person.openWork.items.length === 0 && <Text size="small">No open work items assigned right now.</Text>}
        </Stack>
      ))}
      {context.linkedPages && context.linkedPages.length > 0 && (
        <Inline space="space.100" shouldWrap>
          <Text size="small">Pages linked from the report:</Text>
          {context.linkedPages.map((page) => (
            <Link key={page.url} href={page.url} openNewTab>
              {page.title}
            </Link>
          ))}
        </Inline>
      )}
    </Stack>
  );
};

const MatchCard = ({ match, expanded, onToggle, canDecide, onLink, onProceed, cloudId }) => (
  <Box xcss={cardStyle}>
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <VerdictLozenge verdict={match.verdict} />
        {match.url ? (
          <Link href={match.url} openNewTab>
            {match.issueKey ? `${match.issueKey} ${match.title}` : match.title}
          </Link>
        ) : (
          <Text weight="bold">{match.title}</Text>
        )}
        <OutcomeLozenge outcome={match.outcome} />
        {match.source === 'confluence_backfill' && <Lozenge>Report only</Lozenge>}
      </Inline>
      <Text>
        {`Similarity ${percent(match.score)} (${match.matched} of ${match.matched + match.mismatched} compared conditions match${
          match.notComparable ? `, ${match.notComparable} not comparable` : ''
        })`}
        {match.performedOn ? ` · Run on ${formatDate(match.performedOn)}` : ''}
        {match.owner ? ` · Owner: ${match.owner}` : ''}
      </Text>
      {match.lowCoverage && <Text size="small">Every compared condition matches, but too few conditions could be compared to call this a duplicate.</Text>}
      {match.findings ? <Text>{`Findings: ${match.findings}`}</Text> : <Text size="small">No findings were recorded for this run.</Text>}
      {match.report && (
        <Inline space="space.050">
          <Text>Report:</Text>
          <Link href={match.report.url} openNewTab>
            {match.report.title || 'Open report'}
          </Link>
        </Inline>
      )}
      {expanded && <ComparisonTable rows={match.rows} />}
      {expanded && cloudId && <RunPeople match={match} cloudId={cloudId} />}
      <ButtonGroup>
        <Button appearance="subtle" spacing="compact" onClick={onToggle}>
          {expanded ? 'Hide comparison' : 'Show comparison'}
        </Button>
        {canDecide && (
          <Button spacing="compact" onClick={onLink}>
            Link as repeat
          </Button>
        )}
        {canDecide && (
          <Button spacing="compact" onClick={onProceed}>
            Proceed with reason
          </Button>
        )}
      </ButtonGroup>
    </Stack>
  </Box>
);

const ReasonModal = ({ match, busy, error, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  const [settling, setSettling] = useState(false);
  const latest = useRef(reason);
  latest.current = reason;
  const confirm = async () => {
    setSettling(true);
    await settle();
    setSettling(false);
    onConfirm(latest.current);
  };
  return (
    <Modal onClose={onClose}>
      <ModalHeader>
        <ModalTitle>Proceed with reason</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.150">
          <Text>{`You are about to run an experiment that is ${match.verdict === 'Duplicate' ? 'a duplicate of' : 'similar to'} ${match.issueKey || match.title}. Say why it is worth running, for example a deliberate reproduction or a changed batch. The reason is kept with the experiment.`}</Text>
          <ErrorBanner message={error} />
          <LabeledField id="reason" label="Reason">
            <TextArea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </LabeledField>
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" isDisabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button appearance="primary" isLoading={busy || settling} onClick={confirm}>
            Record reason and proceed
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
};

const LinkModal = ({ match, busy, error, onConfirm, onClose }) => (
  <Modal onClose={onClose}>
    <ModalHeader>
      <ModalTitle>Link as repeat</ModalTitle>
    </ModalHeader>
    <ModalBody>
      <Stack space="space.150">
        <Text>
          {match.issueKey
            ? `This work item will be linked to ${match.issueKey} as a duplicate, and a comment will record that the experiment is not run again.`
            : `This experiment will be recorded as a repeat of the report "${match.title}", and a comment will record that it is not run again.`}
        </Text>
        <ErrorBanner message={error} />
      </Stack>
    </ModalBody>
    <ModalFooter>
      <ButtonGroup>
        <Button appearance="subtle" isDisabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button appearance="primary" isLoading={busy} onClick={onConfirm}>
          Link as repeat
        </Button>
      </ButtonGroup>
    </ModalFooter>
  </Modal>
);

const DecisionBanner = ({ decision, canEdit, busy, onUndo }) => (
  <SectionMessage appearance="information" title={decision.type === 'linked_repeat' ? 'Linked as a repeat' : 'Proceeding with a reason'}>
    <Stack space="space.100">
      <Text>
        {decision.type === 'linked_repeat'
          ? `This experiment repeats ${decision.priorLabel} and is not run again.`
          : `Similar prior run: ${decision.priorLabel}. Reason: ${decision.reason}`}
      </Text>
      <Text size="small">{`Decided${decision.byName ? ` by ${decision.byName}` : ''} on ${formatDate(decision.at)}.`}</Text>
      {canEdit && (
        <Inline>
          <Button appearance="subtle" spacing="compact" isDisabled={busy} onClick={onUndo}>
            Change decision
          </Button>
        </Inline>
      )}
    </Stack>
  </SectionMessage>
);

const VerdictBanner = ({ check }) => {
  if (check.verdict === 'Duplicate') {
    return (
      <SectionMessage appearance="warning" title="This experiment has already been run">
        <Text>{`${check.matches.length === 1 ? 'A prior run has' : `${check.matches.length} prior runs have`} the same or nearly the same conditions. Look at the result below before you spend material and equipment time.`}</Text>
      </SectionMessage>
    );
  }
  if (check.verdict === 'Similar') {
    return (
      <SectionMessage appearance="information" title="Similar experiments exist">
        <Text>No prior run has the same conditions, but some are close. Their results may still tell you what to expect.</Text>
      </SectionMessage>
    );
  }
  return (
    <SectionMessage appearance="success" title="No prior run with these conditions">
      <Text>{`Checked against ${check.checked} other experiment${check.checked === 1 ? '' : 's'} in this project.`}</Text>
    </SectionMessage>
  );
};

const App = () => {
  const productContext = useProductContext();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await call('getPanel');
      setState(data);
      setExpanded(data.check?.matches?.[0]?.recordId || null);
    } catch (failure) {
      setLoadError(failure.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Runs a backend action that returns the new panel state. */
  const run = async (name, payload, after) => {
    setError('');
    setBusy(true);
    try {
      const data = await call(name, payload);
      setState(data);
      setExpanded(data.check?.matches?.[0]?.recordId || null);
      if (after) after();
    } catch (failure) {
      setError(failure.message);
    }
    setBusy(false);
  };

  if (loadError) {
    return (
      <Page>
        <ErrorBanner title="DejaRun could not load this work item" message={loadError} />
        <Inline>
          <Button onClick={load}>Try again</Button>
        </Inline>
      </Page>
    );
  }
  if (!state) return <Loading label="Checking for prior runs" />;

  const { schema, record, check, decision, canEdit, canAdminister } = state;

  if (!schema) {
    return (
      <SectionMessage appearance="information" title="DejaRun is not set up for this project">
        <Text>
          {canAdminister
            ? 'Define which conditions describe an experiment in this project: open the project settings and choose DejaRun settings.'
            : 'A project administrator needs to define the experiment conditions for this project in the project settings, under DejaRun settings.'}
        </Text>
      </SectionMessage>
    );
  }

  if (!record || editing) {
    if (!canEdit) {
      return (
        <SectionMessage appearance="information" title="No experiment registered">
          <Text>This work item has no experiment conditions yet, and you do not have permission to edit it.</Text>
        </SectionMessage>
      );
    }
    return (
      <RegistrationForm
        schema={schema}
        record={record}
        busy={busy}
        error={error}
        onSave={(details) => run('saveExperiment', { details }, () => setEditing(false))}
        onCancel={record ? () => { setEditing(false); setError(''); } : null}
      />
    );
  }

  const canDecide = canEdit && !decision;

  return (
    <Page>
      <Box xcss={cardStyle}>
        <Stack space="space.150">
          <RecordSummary record={record} schema={schema} />
          {canEdit && (
            <Inline>
              <Button spacing="compact" onClick={() => setEditing(true)}>
                Edit conditions
              </Button>
            </Inline>
          )}
        </Stack>
      </Box>

      {!dialog && <ErrorBanner message={error} />}
      {decision && <DecisionBanner decision={decision} canEdit={canEdit} busy={busy} onUndo={() => run('clearDecision')} />}
      {check && <VerdictBanner check={check} />}

      {check?.matches?.length > 0 && (
        <Stack space="space.150">
          <Heading as="h4">Prior runs</Heading>
          {check.matches.map((match) => (
            <MatchCard
              key={match.recordId}
              match={match}
              expanded={expanded === match.recordId}
              onToggle={() => setExpanded(expanded === match.recordId ? null : match.recordId)}
              canDecide={canDecide}
              cloudId={productContext?.cloudId}
              onLink={() => { setError(''); setDialog({ type: 'link', match }); }}
              onProceed={() => { setError(''); setDialog({ type: 'reason', match }); }}
            />
          ))}
        </Stack>
      )}

      <ModalTransition>
        {dialog?.type === 'link' && (
          <LinkModal
            match={dialog.match}
            busy={busy}
            error={error}
            onClose={() => setDialog(null)}
            onConfirm={() => run('linkAsRepeat', { priorRecordId: dialog.match.recordId }, () => setDialog(null))}
          />
        )}
        {dialog?.type === 'reason' && (
          <ReasonModal
            match={dialog.match}
            busy={busy}
            error={error}
            onClose={() => setDialog(null)}
            onConfirm={(reason) => run('proceedWithReason', { priorRecordId: dialog.match.recordId, reason }, () => setDialog(null))}
          />
        )}
      </ModalTransition>
    </Page>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
