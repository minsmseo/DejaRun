import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, { Box, Button, Heading, Inline, List, ListItem, Lozenge, SectionMessage, Stack, Text, xcss } from '@forge/react';
import { call, cardStyle, ErrorBanner, Loading, Page } from './shared';

/**
 * Jira admin page: loads the fictional demo scenario so the product can be
 * tried end to end on an empty site.
 */

const noShrinkStyle = xcss({ flexShrink: '0' });

const STEP_LABEL = {
  project: 'Jira project and parameter schema',
  experiments: 'Work items with experiment records',
  reports: 'Confluence space and report pages',
};

const Part = ({ done, label }) => (
  <Inline space="space.100" alignBlock="center" spread="space-between">
    <Text>{label}</Text>
    <Box xcss={noShrinkStyle}>
      <Lozenge appearance={done ? 'success' : 'default'}>{done ? 'Ready' : 'Missing'}</Lozenge>
    </Box>
  </Inline>
);

const App = () => {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState([]);

  const load = useCallback(async () => {
    try {
      setState(await call('getSeedStatus'));
      setError(null);
    } catch (failure) {
      setError(failure.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setLog([]);
    try {
      for (const project of state.projects) {
        for (const step of state.steps) {
          const key = `${project.key}-${step}`;
          setLog((lines) => [...lines, { key, text: `${project.name}: creating ${STEP_LABEL[step].toLowerCase()}...` }]);
          const { message } = await call('runSeedStep', { projectKey: project.key, step });
          setLog((lines) => lines.map((line) => (line.key === key ? { ...line, text: message } : line)));
        }
      }
    } catch (failure) {
      setError(failure.message);
    }
    await load();
    setRunning(false);
  };

  if (!state && !error) return <Loading label="Checking demo data" />;

  const complete = state?.projects.every((project) => project.project && project.experiments && project.reports);

  return (
    <Page>
      <Text>
        Creates two fictional R&D projects of Halden Materials Lab: an adhesive formulation project and a coating cure project. Each gets a
        parameter schema, past experiments as Jira work items (several of them failed), and Confluence report pages. Some experiments exist
        only as report pages, so you can try the Confluence import. All names, conditions and results are invented.
      </Text>

      <ErrorBanner title="Demo data could not be created" message={error} />

      {state && (
        <>
          <Inline space="space.200" alignBlock="stretch" shouldWrap>
            {state.projects.map((project) => (
              <Box key={project.key} xcss={cardStyle}>
                <Stack space="space.100">
                  <Heading as="h3">{`${project.name} (${project.key})`}</Heading>
                  <Text>{`${project.counts.workItems} experiments as work items, ${project.counts.reportOnly} only as Confluence reports.`}</Text>
                  <Part done={project.project} label={STEP_LABEL.project} />
                  <Part done={project.experiments} label={STEP_LABEL.experiments} />
                  <Part done={project.reports} label={STEP_LABEL.reports} />
                </Stack>
              </Box>
            ))}
          </Inline>

          {complete && !running && (
            <SectionMessage appearance="success" title="Demo data is ready">
              <Text>
                Open the Bio-based Adhesive Formulation project, create a work item, add the DejaRun panel from the work item's app menu and
                register an experiment. Choose DejaRun in the project navigation to see the experiment registry.
              </Text>
            </SectionMessage>
          )}

          <Inline>
            <Button appearance="primary" onClick={run} isLoading={running}>
              {complete ? 'Add missing demo data' : 'Create demo data'}
            </Button>
          </Inline>

          {log.length > 0 && (
            <List type="unordered">
              {log.map((line) => (
                <ListItem key={line.key}>{line.text}</ListItem>
              ))}
            </List>
          )}
          <Text size="small">
            This takes about a minute. Existing projects, spaces, pages, work items and experiment records are never overwritten; only
            missing ones are added. To start over, delete the BAF and CCP projects in Jira and the BAF and CCP spaces in Confluence.
          </Text>
        </>
      )}
    </Page>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
