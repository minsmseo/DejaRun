import * as records from '../data/records.js';
import { getConflicts } from '../services/experiments.js';
import { action, presentForAgent, requireRecord, resolveProject } from './shared.js';

/**
 * explain-conflicting-results: experiments with the same conditions (a
 * Duplicate by the engine) that ended differently, one success and one
 * failure, together with the recorded facts that could explain it.
 *
 * The action returns facts only. The agent may then offer hypotheses, each
 * tied to one of these facts and labelled as a hypothesis.
 */
export const explainConflictingResults = action('explain-conflicting-results', async (payload) => {
  const { projectId, projectKey, siteUrl, schema } = await resolveProject(payload, payload.experiment);
  const allRecords = await records.listRecords(projectId);
  const record = payload.experiment ? await requireRecord(projectId, payload.experiment) : null;
  const conflicts = getConflicts({ schema, record, allRecords, siteUrl });

  return {
    project: projectKey,
    scope: record ? `Experiments with the same conditions as ${record.issueKey || record.id}` : 'All experiments in the project',
    conflictCount: conflicts.length,
    conflicts: conflicts.map((conflict) => ({
      earlierRun: presentForAgent(conflict.first, schema),
      laterRun: presentForAgent(conflict.second, schema),
      similarityPercent: Math.round(conflict.score * 100),
      daysBetweenRuns: conflict.evidence.daysApart,
      conditionsWithinToleranceButNotIdentical: conflict.evidence.closeButNotIdentical,
      conditionsRecordedForOnlyOneRun: conflict.evidence.recordedOnOneSideOnly,
      conditionsOutsideTolerance: conflict.evidence.different,
    })),
    howToAnswer: conflicts.length
      ? [
          'State the conflict first: which run succeeded, which failed, with references and urls.',
          'Then list the recorded differences exactly as given here, and quote what each run\'s findings say.',
          'Only then offer possible explanations. Put them under a heading "Hypotheses, not findings". Tie each one to a specific recorded difference or to a sentence in the findings. If nothing recorded could explain the difference, say that the records do not explain it.',
          'For each hypothesis say what should be measured or recorded to confirm or rule it out, for example a condition the schema does not capture yet.',
          'Never present a hypothesis as the cause, and never invent values, measurements or results.',
        ]
      : ['No experiments with the same conditions and opposite results are on record. Say exactly that; do not speculate.'],
  };
});
