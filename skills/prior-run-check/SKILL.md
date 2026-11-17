---
name: prior-run-check
description: Check whether an R&D experiment has already been run before it is planned or started. Compares the planned conditions (system, test method and parameters such as cure temperature or filler loading) with past experiments recorded in Jira and Confluence, reports Duplicate, Similar or New with a field-by-field comparison, summarizes what earlier runs found (including failed ones), and records the decision to link the experiment as a repeat. Use when someone plans an experiment, asks whether something has been tried before, or wants the lessons from past runs on a material system or method.
allowed-tools: find-prior-runs get-experiment-record compare-experiments summarize-learnings propose-record-from-page register-experiment link-as-repeat get-run-owners find-people-on-system
compatibility: Requires the DejaRun Forge app installed in Jira (and in Confluence for report pages), and a parameter schema configured for the Jira project.
---

# Prior run check before planning an experiment

Use this procedure before an experiment is planned or started in a Jira project that uses DejaRun. It works for any parameter schema a project has defined, not for one material or process.

## Ground rules

- Verdicts (Duplicate, Similar, New) and comparisons come from deterministic code in the tools: categorical conditions must be equal, numeric conditions are converted to a common unit and must be within the tolerance set in the project's schema. Report verdicts unchanged. Never invent, soften or override one.
- Never state an experimental result that is not in a tool result. If no experiment on record matches, say so.
- Cite every experiment you mention with its reference (work item key or record id) and its url, and the report link when there is one.
- `register-experiment` and `link-as-repeat` write data. Show the user exactly what will be recorded and get an explicit yes before calling them. Never call a write tool in the same turn in which you first propose it.
- Every tool takes an optional `projectKey`. Omit it when the conversation was opened from the project or when a work item key is given.

## Procedure

1. **Collect the planned conditions.** Ask for the system under test, the test method and the conditions the user already knows. Partial conditions are fine; conditions that are missing are left out of the comparison rather than counted as different.
2. **Check.** Call `find-prior-runs` with `system`, `method` and `conditions` written as `Name: value unit` pairs separated by semicolons, for example `Cure temperature: 122 °C; Substrate: Aluminum`. If the result lists `conditionsNotInSchema`, tell the user which names were not used.
3. **Report the verdict.** Lead with the verdict. For each prior run give its reference, outcome, findings and the conditions that differ. For a Duplicate, state what the earlier run found before anything else: a failed prior run is the most valuable result to surface.
4. **Widen the view when useful.** For questions about a range rather than exact conditions ("above 120 °C on aluminum"), call `summarize-learnings` with `filters` such as `Cure temperature > 120 °C; Substrate = Aluminum`. Present succeeded, failed and inconclusive runs separately.
5. **Look closer.** Use `get-experiment-record` for one experiment's full record and decision, and `compare-experiments` for the exact differences between two experiments.
6. **Point to people.** When a prior run matters, call `get-run-owners` to say who owned it, who wrote its report and what they are working on now. Call `find-people-on-system` to see who else is planning or running experiments on the same system. Name only people the tools return.
7. **Bring in report-only experiments.** If the user points to a Confluence report page that is not registered, call `propose-record-from-page`, show the proposed record, and on a clear yes call `register-experiment` with that page.
8. **Record the decision.** If the user decides not to repeat a Duplicate, name both experiments, ask for confirmation, then call `link-as-repeat`. If the user decides to run it anyway (for example a deliberate reproduction), tell them to record the reason with "Proceed with reason" in the DejaRun panel of the work item; that decision is taken by the researcher, not by the agent.

## Handling problems

- A tool result with an `error` field is a message for the user. Relay it in plain words with the next step it suggests. Do not retry in a loop.
- If a project has no parameter schema, a project administrator must set one up in Project settings > DejaRun settings.
