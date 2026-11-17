# Judging notes

How DejaRun addresses each Codegeist 2026 judging criterion (20% each), with where to look.

## Technological Implementation

- **Not a keyword search wrapper.** Experiments are compared as structured conditions. `src/engine/compare.js` converts numeric values to a common unit and applies a per-field tolerance (absolute or percent); `src/engine/similarity.js` weights the fields, leaves out what cannot be compared, and derives the verdict.
- **Explains why.** Every verdict comes with a comparison table: this experiment, prior run, match or not, and the reason ("Difference 2 °C is within ±5 °C").
- **Nothing hard-coded for the demo.** The schema, tolerances, weights and thresholds are per-project settings. The two demo projects run on different schemas with the same code. `src/seed` only creates data.
- **Deterministic and tested.** The engine, the filter language, the table parser and the Teamwork Graph client are pure functions with 48 unit tests (`npm test`).
- **Guards against misleading results.** A full score with too little compared is Similar, not Duplicate. An experiment is never a duplicate of one that came later. A value on one side only is "not comparable", not "different".
- **Platform use.** Ten Forge module types, Jira and Confluence in one app (`app.compatibility`), issue event trigger with `ignoreSelf`, Forge hosted storage, Teamwork Graph API, `rovo:agent`, `rovo:mcp`, `rovo:skill`. `docs/platform-notes.md` records what the official documentation says and what real calls returned.
- **Security.** Every read goes through the current user's permissions. Agent inputs are treated as untrusted: the project is resolved as the user, and write actions check edit permission themselves.

## Design

- **The verdict finds the researcher**: every work item shows it in its details area without adding a panel, and the panel leads with the verdict and what the earlier run found.
- **One uninterrupted flow**: register conditions, see the verdict, compare, decide, and the decision is recorded and commented, all inside the work item.
- **States covered**: project without a schema (different text for administrators and others), work item without a record, no edit permission, loading, backend errors with a retry, validation errors next to the form, Confluence not connected, nothing to import.
- **Plain words on screen**: "This experiment has already been run", "Link as repeat", "Proceed with reason". No scores without an explanation.
- **Native look**: UI Kit only.

## Potential Impact

- **Narrow audience**: R&D labs in materials, chemicals and process development, where one repeated experiment costs material, equipment time and weeks.
- **Shows the saving**: the registry counts repeats avoided, repeats run with a reason, and duplicates awaiting a decision.
- **Works from day one**: the Confluence import brings in years of report-only experiments without retyping them.
- **Any lab's vocabulary**: the schema is the lab's own parameters, so the app is not tied to adhesives or coatings.

## Innovation

- **Failed experiments become findable.** The first thing shown for a Duplicate is what the earlier run found and why it failed.
- **Report-only experiments are included**, extracted from tables by code.
- **Repeats are a decision, not a prohibition.** "Proceed with reason" keeps deliberate reproductions legitimate and visible.
- **People, not just records.** The Teamwork Graph adds who wrote the report and what they work on now, including for experiments that never had a work item.
- **Contradictions are surfaced.** Experiments with the same conditions and opposite results are found by code, with the recorded differences as evidence. The agent may explain them only as hypotheses tied to that evidence, each with what to measure to settle it.
- **The agent cannot overrule the engine.** It explains verdicts and must cite a work item or report for every claim.

## Presentation

- `docs/demo-script.md`: an under-five-minute scenario, with a note on which scenes have been run on the development site.
- Demo data is code (`src/seed/demoData.js`) and loads from a Jira admin page in about a minute, so judges can reproduce the video.
- README has install steps and a walk-through with the exact values to type.
