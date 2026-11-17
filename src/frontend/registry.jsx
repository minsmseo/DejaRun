import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Checkbox,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Select,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  xcss,
} from '@forge/react';
import { call, cardStyle, ErrorBanner, formatDate, Loading, OUTCOME_LABEL, OutcomeLozenge, Page, percent, VerdictLozenge } from './shared';

/**
 * Project page: the experiment registry. Lists every experiment record of
 * the project, shows how many repeats were avoided, and imports past
 * experiments that only exist as Confluence report pages.
 */

const statStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
  minWidth: '150px',
});
const filterStyle = xcss({ width: '220px' });
const panelStyle = xcss({ paddingTop: 'space.200', width: '100%' });

const OUTCOME_FILTERS = [{ label: 'All outcomes', value: 'all' }, ...Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ label, value }))];
const SOURCE_FILTERS = [
  { label: 'All sources', value: 'all' },
  { label: 'Work items', value: 'issue' },
  { label: 'Report only', value: 'report' },
];

const Stat = ({ value, label, help }) => (
  <Box xcss={statStyle}>
    <Stack space="space.050">
      <Heading as="h2">{String(value)}</Heading>
      <Text weight="medium">{label}</Text>
      {help && <Text size="small">{help}</Text>}
    </Stack>
  </Box>
);

const describeDecision = (decision) => {
  if (!decision) return '';
  return decision.type === 'linked_repeat' ? `Not run again: repeat of ${decision.priorLabel}` : `Run with reason: ${decision.reason}`;
};

const RegistryTab = ({ registry }) => {
  const [outcome, setOutcome] = useState(OUTCOME_FILTERS[0]);
  const [source, setSource] = useState(SOURCE_FILTERS[0]);
  const { stats } = registry;

  const visible = registry.rows.filter(
    (row) => (outcome.value === 'all' || row.outcome === outcome.value) && (source.value === 'all' || (source.value === 'issue') === Boolean(row.issueKey))
  );

  const rows = visible.map((row) => ({
    key: row.recordId,
    cells: [
      {
        key: 'title',
        content: row.url ? (
          <Link href={row.url} openNewTab>
            {row.issueKey ? `${row.issueKey} ${row.title}` : row.title}
          </Link>
        ) : (
          <Text>{row.title}</Text>
        ),
      },
      { key: 'system', content: <Text>{row.system}</Text> },
      { key: 'method', content: <Text>{row.method}</Text> },
      { key: 'outcome', content: <OutcomeLozenge outcome={row.outcome} /> },
      { key: 'date', content: <Text>{formatDate(row.performedOn) || 'Not run yet'}</Text> },
      { key: 'owner', content: row.issueKey ? <Text>{row.owner || 'Unassigned'}</Text> : <Lozenge>Report only</Lozenge> },
      { key: 'check', content: row.verdict && row.verdict !== 'New' ? <VerdictLozenge verdict={row.verdict} /> : <Text size="small">No prior run</Text> },
      { key: 'decision', content: <Text size="small">{describeDecision(row.decision)}</Text> },
    ],
  }));

  return (
    <Stack space="space.300">
      <Inline space="space.200" shouldWrap>
        <Stat value={stats.repeatsAvoided} label="Repeats avoided" help="Linked to a prior run instead of being run again" />
        <Stat value={stats.repeatsWithReason} label="Repeats run with a reason" help="Deliberate repeats, with the reason on record" />
        <Stat value={stats.openDuplicates} label="Duplicates awaiting a decision" />
        <Stat value={stats.total} label="Experiments on record" help={`${stats.failed} failed, ${stats.reportOnly} known only from reports`} />
      </Inline>

      <Inline space="space.200" alignBlock="center" shouldWrap>
        <Box xcss={filterStyle}>
          <Select inputId="outcome-filter" options={OUTCOME_FILTERS} value={outcome} onChange={setOutcome} />
        </Box>
        <Box xcss={filterStyle}>
          <Select inputId="source-filter" options={SOURCE_FILTERS} value={source} onChange={setSource} />
        </Box>
        <Text>{`${visible.length} of ${registry.rows.length} experiments`}</Text>
      </Inline>

      <DynamicTable
        head={{
          cells: [
            { key: 'title', content: 'Experiment', width: 26 },
            { key: 'system', content: 'System', width: 12 },
            { key: 'method', content: 'Method', width: 10 },
            { key: 'outcome', content: 'Outcome', width: 9 },
            { key: 'date', content: 'Run date', width: 9 },
            { key: 'owner', content: 'Owner', width: 10 },
            { key: 'check', content: 'Prior run check', width: 9 },
            { key: 'decision', content: 'Decision', width: 15 },
          ],
        }}
        rows={rows}
        rowsPerPage={15}
        emptyView={<Text>No experiment matches these filters.</Text>}
      />
    </Stack>
  );
};

/** One line with the conditions found on a report page. */
const describeConditions = (candidate) => {
  const parts = [candidate.details.system, candidate.details.method].filter(Boolean);
  const values = Object.values(candidate.details.parameters).map((entry) => `${entry.value}${entry.unit ? ` ${entry.unit}` : ''}`);
  return [...parts, ...values].join(' · ');
};

const ImportTab = ({ spaceKey, onImported }) => {
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const runScan = async () => {
    setError('');
    setResult(null);
    setBusy('scan');
    try {
      const data = await call('scanReports');
      setScan(data);
      // Pages that can be imported start selected; the person unticks what they do not want.
      setSelected(Object.fromEntries(data.candidates.filter((candidate) => !candidate.problems.length).map((candidate) => [candidate.pageId, true])));
    } catch (failure) {
      setError(failure.message);
    }
    setBusy('');
  };

  const runImport = async () => {
    setError('');
    setBusy('import');
    try {
      const pageIds = Object.keys(selected).filter((pageId) => selected[pageId]);
      const data = await call('importReports', { pageIds });
      setResult(data);
      setScan(null);
      onImported();
    } catch (failure) {
      setError(failure.message);
    }
    setBusy('');
  };

  const chosen = Object.values(selected).filter(Boolean).length;

  return (
    <Stack space="space.300">
      <Text>
        Past experiments often exist only as a report page. DejaRun reads the conditions table of every page in the linked Confluence space
        and offers the pages whose table uses the parameter names of this project. Nothing is registered until you confirm.
      </Text>
      <ErrorBanner title="The Confluence import did not work" message={error} />

      {result && (
        <SectionMessage appearance={result.imported.length ? 'success' : 'warning'} title={`${result.imported.length} experiment${result.imported.length === 1 ? '' : 's'} imported`}>
          <Stack space="space.050">
            <Text>They now appear in the registry and are found as prior runs when a new experiment is checked.</Text>
            {result.skipped.map((skip) => (
              <Text key={skip.pageId} size="small">{`Page ${skip.pageId} was skipped: ${skip.reason}`}</Text>
            ))}
          </Stack>
        </SectionMessage>
      )}

      <Inline space="space.100" alignBlock="center">
        <Button appearance={scan ? 'default' : 'primary'} isLoading={busy === 'scan'} isDisabled={busy === 'import'} onClick={runScan}>
          {spaceKey ? `Scan space ${spaceKey} for experiment reports` : 'Scan for experiment reports'}
        </Button>
      </Inline>

      {scan && (
        <Stack space="space.200">
          <Text>
            {`Read ${scan.scanned} page${scan.scanned === 1 ? '' : 's'} in ${scan.space.name}: ${scan.candidates.length} new experiment report${
              scan.candidates.length === 1 ? '' : 's'
            }, ${scan.alreadyRegistered} already in the registry, ${scan.notExperiments} without a matching conditions table.`}
            {scan.truncated ? ' The space has more pages than DejaRun reads in one scan.' : ''}
          </Text>

          {scan.candidates.length === 0 ? (
            <SectionMessage appearance="information" title="Nothing new to import">
              <Text>Every experiment report in this space is already in the registry.</Text>
            </SectionMessage>
          ) : (
            <>
              <DynamicTable
                head={{
                  cells: [
                    { key: 'select', content: 'Import', width: 7 },
                    { key: 'title', content: 'Report page', width: 26 },
                    { key: 'conditions', content: 'Conditions read from the page', width: 37 },
                    { key: 'outcome', content: 'Outcome', width: 10 },
                    { key: 'check', content: 'Compared with the registry', width: 20 },
                  ],
                }}
                rows={scan.candidates.map((candidate) => ({
                  key: candidate.pageId,
                  cells: [
                    {
                      key: 'select',
                      content: (
                        <Checkbox
                          label=""
                          isChecked={Boolean(selected[candidate.pageId])}
                          isDisabled={candidate.problems.length > 0}
                          onChange={(event) => setSelected((current) => ({ ...current, [candidate.pageId]: event.target.checked }))}
                        />
                      ),
                    },
                    {
                      key: 'title',
                      content: candidate.url ? (
                        <Link href={candidate.url} openNewTab>
                          {candidate.title}
                        </Link>
                      ) : (
                        <Text>{candidate.title}</Text>
                      ),
                    },
                    {
                      key: 'conditions',
                      content: candidate.problems.length ? <Text size="small">{`Cannot be imported: ${candidate.problems.join(' ')}`}</Text> : <Text size="small">{describeConditions(candidate)}</Text>,
                    },
                    { key: 'outcome', content: <OutcomeLozenge outcome={candidate.details.outcome} /> },
                    {
                      key: 'check',
                      content:
                        candidate.verdict && candidate.verdict !== 'New' ? (
                          <Inline space="space.050" alignBlock="center">
                            <VerdictLozenge verdict={candidate.verdict} />
                            <Text size="small">{`${percent(candidate.closest.score)} with ${candidate.closest.label}`}</Text>
                          </Inline>
                        ) : (
                          <Text size="small">No similar experiment on record</Text>
                        ),
                    },
                  ],
                }))}
              />
              <Inline>
                <Button appearance="primary" isDisabled={chosen === 0 || busy === 'scan'} isLoading={busy === 'import'} onClick={runImport}>
                  {`Import ${chosen} selected report${chosen === 1 ? '' : 's'}`}
                </Button>
              </Inline>
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
};

const App = () => {
  const [registry, setRegistry] = useState(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRegistry(await call('getRegistry'));
    } catch (failure) {
      setLoadError(failure.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <Page>
        <ErrorBanner title="The experiment registry could not be loaded" message={loadError} />
        <Inline>
          <Button onClick={load}>Try again</Button>
        </Inline>
      </Page>
    );
  }
  if (!registry) return <Loading label="Loading experiment registry" />;

  if (!registry.hasSchema) {
    return (
      <EmptyState
        header="DejaRun is not set up for this project"
        description={
          registry.canAdminister
            ? 'Define which conditions describe an experiment in this project: open the project settings and choose DejaRun settings.'
            : 'A project administrator needs to define the experiment conditions for this project in the project settings, under DejaRun settings.'
        }
      />
    );
  }

  return (
    <Tabs id="dejarun-tabs">
      <TabList>
        <Tab>Experiment registry</Tab>
        <Tab>Import from Confluence</Tab>
      </TabList>
      <TabPanel>
        <Box xcss={panelStyle}>
          {registry.rows.length === 0 ? (
            <EmptyState
              header="No experiments on record yet"
              description="Open a work item, add the DejaRun panel from the work item's app menu and register the experiment conditions. Past experiments that only exist as Confluence reports can be imported from the second tab."
            />
          ) : (
            <RegistryTab registry={registry} />
          )}
        </Box>
      </TabPanel>
      <TabPanel>
        <Box xcss={panelStyle}>
          {registry.canEdit ? (
            <ImportTab spaceKey={registry.spaceKey} onImported={load} />
          ) : (
            <SectionMessage appearance="information" title="View only">
              <Text>You need permission to edit work items in this project to import experiments.</Text>
            </SectionMessage>
          )}
        </Box>
      </TabPanel>
    </Tabs>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
