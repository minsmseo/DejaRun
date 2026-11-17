import React from 'react';
import { Inline, Lozenge, SectionMessage, Spinner, Stack, Text, xcss } from '@forge/react';
import { invoke } from '@forge/bridge';

/**
 * Calls a backend resolver. Resolvers answer { ok, data } or { ok, error };
 * this turns the error case into a thrown Error with a readable message.
 */
export const call = async (name, payload = {}) => {
  let response;
  try {
    response = await invoke(name, payload);
  } catch (error) {
    throw new Error('DejaRun could not reach its backend. Check your connection and try again.');
  }
  if (!response?.ok) {
    const failure = new Error(response?.error?.message || 'Something went wrong. Try again in a moment.');
    failure.code = response?.error?.code;
    throw failure;
  }
  return response.data;
};

export const cardStyle = xcss({
  padding: 'space.200',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
});

const VERDICT_APPEARANCE = { Duplicate: 'removed', Similar: 'moved', New: 'success' };

export const VerdictLozenge = ({ verdict }) => (
  <Lozenge appearance={VERDICT_APPEARANCE[verdict] || 'default'} isBold>
    {verdict || 'Not checked'}
  </Lozenge>
);

const OUTCOME_APPEARANCE = { success: 'success', failed: 'removed', inconclusive: 'moved', planned: 'inprogress' };
export const OUTCOME_LABEL = { success: 'Success', failed: 'Failed', inconclusive: 'Inconclusive', planned: 'Planned' };

export const OutcomeLozenge = ({ outcome }) => (
  <Lozenge appearance={OUTCOME_APPEARANCE[outcome] || 'default'}>{OUTCOME_LABEL[outcome] || 'Unknown'}</Lozenge>
);

export const Loading = ({ label }) => (
  <Inline space="space.100" alignBlock="center">
    <Spinner size="medium" label={label} />
    <Text>{label}</Text>
  </Inline>
);

export const ErrorBanner = ({ title = 'Something went wrong', message }) =>
  message ? (
    <SectionMessage appearance="error" title={title}>
      <Text>{message}</Text>
    </SectionMessage>
  ) : null;

export const formatDate = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { dateStyle: 'medium' });
};

/** "92%" from 0.92. */
export const percent = (value) => (typeof value === 'number' ? `${Math.round(value * 100)}%` : '');

export const Page = ({ children }) => <Stack space="space.300">{children}</Stack>;
