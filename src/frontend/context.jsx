import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, { Button, Inline, Link, Stack, Text } from '@forge/react';
import { call, formatDate, Loading, OutcomeLozenge, percent, VerdictLozenge } from './shared';

/**
 * Work item context area (the fields on the right). Shows the prior-run
 * verdict on every work item without anyone adding a panel: the lozenge next
 * to the label comes from src/contextStatus.js, and this is what appears
 * when the entry is expanded. It is a summary; registering conditions,
 * comparing and deciding happen in the DejaRun panel.
 */

const HOW_TO_OPEN = 'Choose the app button under the work item title, then DejaRun.';

const App = () => {
  const [state, setState] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setState(await call('getPanel'));
    } catch (failure) {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (failed) {
    return (
      <Stack space="space.100">
        <Text>DejaRun could not load the check for this work item.</Text>
        <Inline>
          <Button spacing="compact" onClick={load}>
            Try again
          </Button>
        </Inline>
      </Stack>
    );
  }
  if (!state) return <Loading label="Checking for prior runs" />;

  const { schema, record, check, decision } = state;

  if (!schema) return <Text>This project has no DejaRun parameter schema yet. A project administrator can set one up under Project settings, DejaRun settings.</Text>;
  if (!record) {
    return (
      <Stack space="space.100">
        <Text>No experiment conditions are registered for this work item.</Text>
        <Text size="small">{`To register them and check for prior runs, open the DejaRun panel. ${HOW_TO_OPEN}`}</Text>
      </Stack>
    );
  }

  const top = check?.matches?.[0];
  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <VerdictLozenge verdict={check?.verdict} />
        <Text>{`${record.system} · ${record.method}`}</Text>
      </Inline>

      {decision && (
        <Text weight="medium">
          {decision.type === 'linked_repeat' ? `Linked as a repeat of ${decision.priorLabel}. Not run again.` : `Proceeding with a reason: ${decision.reason}`}
        </Text>
      )}

      {top ? (
        <Stack space="space.050">
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <Text>{`${percent(top.score)} like`}</Text>
            {top.url ? (
              <Link href={top.url} openNewTab>
                {top.issueKey || top.title}
              </Link>
            ) : (
              <Text weight="medium">{top.title}</Text>
            )}
            <OutcomeLozenge outcome={top.outcome} />
          </Inline>
          {top.performedOn && <Text size="small">{`Run on ${formatDate(top.performedOn)}`}</Text>}
          {top.findings && <Text size="small">{top.findings}</Text>}
          {check.matches.length > 1 && <Text size="small">{`${check.matches.length - 1} more prior run${check.matches.length > 2 ? 's' : ''} in the panel.`}</Text>}
        </Stack>
      ) : (
        <Text size="small">{`No prior run with these conditions among ${check?.checked ?? 0} experiments on record.`}</Text>
      )}

      {!decision && top && <Text size="small">{`Compare the conditions and decide in the DejaRun panel. ${HOW_TO_OPEN}`}</Text>}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
