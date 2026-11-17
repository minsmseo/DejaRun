/**
 * Builds the Jira comments DejaRun writes, in Atlassian Document Format.
 * Pure functions: they only turn data into a document.
 */

const text = (value, marks) => ({ type: 'text', text: String(value), ...(marks ? { marks } : {}) });
const strong = (value) => text(value, [{ type: 'strong' }]);
const link = (label, href) => (href ? text(label, [{ type: 'link', attrs: { href } }]) : text(label));
const paragraph = (...content) => ({ type: 'paragraph', content: content.filter(Boolean) });
const doc = (...content) => ({ type: 'doc', version: 1, content: content.filter(Boolean) });

const OUTCOME_TEXT = { success: 'succeeded', failed: 'failed', inconclusive: 'was inconclusive', planned: 'is planned but has no result yet' };
const percent = (value) => `${Math.round(value * 100)}%`;

/**
 * Comment added when a new experiment is judged a Duplicate of a prior run.
 * `match` is a presented match (see services/experiments.js).
 */
export const duplicateComment = ({ match, assigneeId }) => {
  const label = match.issueKey || match.title;
  const differing = match.rows.filter((row) => row.status === 'mismatch').map((row) => row.name);
  return doc(
    paragraph(
      assigneeId ? { type: 'mention', attrs: { id: assigneeId } } : null,
      assigneeId ? text(' ') : null,
      strong('DejaRun: this experiment looks like a duplicate of a prior run.')
    ),
    paragraph(
      text('Prior run: '),
      link(label, match.url),
      text(match.issueKey && match.title ? ` (${match.title})` : ''),
      text(`. Similarity ${percent(match.score)}`),
      text(differing.length ? `, differing in ${differing.join(', ')}.` : ', with every compared condition within tolerance.')
    ),
    paragraph(text(`The prior run ${OUTCOME_TEXT[match.outcome] || 'has no recorded result'}.`), match.findings ? text(` Findings: ${match.findings}`) : null),
    match.report?.url ? paragraph(text('Report: '), link(match.report.title || match.report.url, match.report.url)) : null,
    paragraph(text('Open the DejaRun panel on this work item to compare the conditions, then link it as a repeat or proceed with a reason.'))
  );
};

/** Comment that records the decision a researcher took in the panel. */
export const decisionComment = (decision) => {
  if (decision.type === 'linked_repeat') {
    return doc(
      paragraph(strong('DejaRun decision: linked as a repeat.')),
      paragraph(text('This experiment repeats '), link(decision.priorLabel, decision.priorUrl), text(' and will not be run again.'))
    );
  }
  return doc(
    paragraph(strong('DejaRun decision: proceed with reason.')),
    paragraph(text('Similar prior run: '), link(decision.priorLabel, decision.priorUrl), text('.')),
    paragraph(text(`Reason: ${decision.reason}`))
  );
};
