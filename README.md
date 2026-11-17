# DejaRun

**Find the experiment you are about to repeat, before you run it.**

DejaRun is an Atlassian Forge app for R&D labs. When a researcher plans a new experiment in Jira, DejaRun compares its conditions with every past experiment recorded in Jira and Confluence, shows the ones that are the same or close, and says what they found. That includes the failed ones and the ones that only exist as a report page.

Built for Atlassian Codegeist 2026, category **Apps for Specialized Industries** (materials, chemicals and process R&D).

> All demo data is fictional. The organisation (Halden Materials Lab), product names, conditions and results are invented.

## The problem

Experiment records are scattered across personal reports and tickets, and they leave with the people who wrote them. Failed experiments are rarely shared at all. So the same conditions get run again, and material, equipment time and weeks of schedule are spent on a result the lab already had.

Keyword search does not solve this. Two experiments are the same when their *conditions* are the same: 122 °C is the same cure as 120 °C if the oven tolerance is ±5 °C, 393 K is the same as 120 °C, and "10 wt% filler" is not the same as "20 wt% filler" even though every word matches.

## What DejaRun does

| Step | What happens |
|---|---|
| Define | A project administrator defines the **parameter schema**: the conditions that describe an experiment in this project, each categorical or numeric with a unit, a tolerance and a weight. |
| Register | A researcher enters the planned conditions in the DejaRun panel of a work item. |
| Check | DejaRun compares them with every prior experiment and gives a verdict: **Duplicate**, **Similar** or **New**, with a field-by-field comparison table. |
| Decide | The researcher either **links it as a repeat** (the experiment is not run again) or **proceeds with a reason** (a deliberate reproduction, with the reason on record). |
| Record | The registry shows every experiment, and how many repeats were avoided or run with a reason. |

### What is in the app

- **Issue panel** (Jira work item): registration form generated from the schema, verdict, prior runs with outcome, findings and report link, comparison table, the two decisions.
- **Automatic check**: saving conditions runs the check at once. A work item created with a conditions table in its description is registered and checked by an issue event trigger. A Duplicate is reported once in a comment that mentions the assignee.
- **Experiment registry** (Jira project page): all experiments with outcome and source filters, repeats avoided, repeats run with a reason, duplicates awaiting a decision.
- **Confluence import** (same page): reads the conditions table of every page in the linked space, offers the pages whose labels match the schema, and registers them after a person confirms. Extraction is done by code, not by a language model.
- **Parameter schema settings** (Jira project settings page): add, edit, reorder and remove parameters, set tolerances, weights and verdict thresholds, load a built-in example.
- **Prior Run Agent** (Rovo agent): answers "has this been run before?" and "what did past runs find above 120 °C on aluminum?" from the records, with links, and registers experiments or links repeats after confirmation.
- **MCP server** (`rovo:mcp`): the same nine actions as tools for other agents and MCP clients.
- **Reusable skill** (`rovo:skill`): the procedure "check for prior runs before planning an experiment", in `skills/prior-run-check/SKILL.md`.
- **Teamwork Graph**: "Ask the people who ran it". For a prior run, DejaRun reads who wrote and contributed to its report page and what those people are working on now.
- **Demo data loader** (Jira admin page): creates two fictional projects so the whole flow can be tried on an empty site.

## How the verdict is computed

The verdict is deterministic code in `src/engine`, with no Forge dependency and unit tests in `test/`.

1. **Categorical** fields (system, method, categorical parameters) match when equal, ignoring case and extra spaces.
2. **Numeric** fields are converted to the unit of the schema field, then match when the difference is within the tolerance. The tolerance is absolute (±5 °C) or a percentage (±10%). Supported conversions: °C and K, min and h, wt% and ppm, kPa and bar. Other units compare only with themselves.
3. A field that only one experiment has a value for is **not comparable**. It is shown as such and left out of the score, not counted as a difference.
4. The **score** is the weighted share of matching fields among the comparable ones.
5. **Duplicate** at or above the duplicate threshold (default 95%), **Similar** at or above the similar threshold (default 60%), otherwise **New**. A full score is only Duplicate when enough of the schema could be compared (default 60% of the total weight); otherwise it is reported as Similar.
6. An experiment is only compared with experiments that happened, or were recorded, no later than itself, so last year's run is not flagged as a duplicate of yesterday's reproduction.

The result always includes the comparison table (this experiment, prior run, match or not, and why), never a score alone.

### The agent explains, the engine decides

The Rovo agent turns a question into structured conditions or filters, calls an action, and explains the result. It cannot change a verdict, and its prompt forbids stating a result that is not in an action result. Write actions run only after the user confirms, and every action resolves the project as the current user, so no input can widen access.

## Try it

### Install

1. Install the app in Jira, then in Confluence, on the same site.
2. The app uses Teamwork Graph scopes, so the installing user must be an organization admin.
3. For the agent, Rovo must be available on the site.

Installation link: not published yet. It will be added here before submission.

### Load the demo data

1. In Jira, open **Settings > Apps > DejaRun demo data** and choose **Create demo data**. It takes about a minute.
2. This creates two projects:
   - **Bio-based Adhesive Formulation (BAF)**: resin type, hardener ratio, filler loading, cure temperature, cure time, substrate.
   - **Coating Cure Process (CCP)**: coating type, film thickness, cure temperature, cure time, humidity.
3. Each project gets past experiments as work items (several failed), report pages in a Confluence space of the same key, and five experiments that exist only as report pages.

### Walk through it

1. In BAF, create a work item. Open it, choose the app button under the title and add **DejaRun**.
2. Enter: system *Bio-epoxy BE-200*, method *Lap shear test*, resin *Epoxidized soybean oil*, hardener 30 wt%, filler 10 wt%, cure temperature **122** °C, cure time 60 min, substrate *Aluminum*. Save.
3. The verdict is **Duplicate** of BAF-1, which failed eight months ago at 120 °C. The comparison shows the 2 °C difference is within ±5 °C. The work item gets a comment.
4. Choose **Edit conditions**, change filler loading to 15 wt% and save. The verdict drops to **Similar**. Choose **Proceed with reason**, or go back and choose **Link as repeat**.
5. Open **DejaRun** in the project navigation for the registry. On the **Import from Confluence** tab, scan the space and import the five report-only experiments.
6. Open Rovo Chat, pick **Prior Run Agent** and ask: *Has anyone tested epoxidized soybean oil resin above 120 °C on aluminum?*
7. Open CCP and repeat steps 1 to 3 with coating conditions. Same app, different schema, no code change.

## Architecture

```
manifest.yml
src/
  index.js              entry point: resolvers, trigger, action handlers
  engine/               pure functions, unit tested
    units.js            unit conversion
    compare.js          field-by-field comparison table
    similarity.js       score, verdict, prior-run rule
    filter.js           condition filters for range questions
  domain/               pure functions: schema and record validation
  backfill/parseTable.js  conditions tables from Confluence storage format and Jira ADF
  data/                 Forge hosted storage (KVS): schemas, records, checks, decisions
  services/             experiments, registry, backfill, comments
  actions/              one file per Rovo action
  clients/              jira.js, confluence.js, twg.js (every Teamwork Graph query)
  seed/                 fictional demo data and its loader
  frontend/             UI Kit screens
skills/prior-run-check/ reusable Rovo skill
test/                   node --test
docs/                   platform notes, demo script, judging notes
```

- **Forge modules**: `jira:issuePanel`, `jira:projectPage`, `jira:projectSettingsPage`, `jira:adminPage`, `trigger`, `rovo:agent`, `action`, `rovo:mcp`, `rovo:skill`.
- **Atlassian apps**: Jira (required), Confluence (optional), Rovo, Teamwork Graph API.
- **UI**: UI Kit only.
- **Storage**: Forge hosted storage only. No egress, no external service, no external language model. The app is eligible for Runs on Atlassian.
- **Permissions**: reading goes through the current user's Jira and Confluence permissions. Changing the schema needs project administration; registering, deciding and importing need permission to edit work items.

## Bonus prize evidence

| Prize | Where |
|---|---|
| Rovo agents | `rovo:agent` "Prior Run Agent" with nine `action` modules and a `rovo:skill`, in `manifest.yml` and `src/actions/` |
| Atlassian MCP | `rovo:mcp` module exposing the nine actions as tools |
| Teamwork Graph | `src/clients/twg.js`: `confluencePageCreator`, `confluencePageContributors`, `confluencePageLinkedConfluencePages`, `atlassianUserAssignedJiraWorkItems`, used by the issue panel and by the `get-run-owners` action. Results of real calls are in `docs/platform-notes.md` |

## Development

```
npm install
npm test
forge lint
forge deploy
forge install
```

Requires Node.js 22.x or 24.x and the Forge CLI. Platform research and the results of real API calls are in [docs/platform-notes.md](docs/platform-notes.md).

## Data and privacy

DejaRun stores parameter schemas, experiment records, check results and decisions in Forge hosted storage on the Atlassian platform. It stores account ids, not names; names are looked up from Jira when shown. It sends no data outside Atlassian.
