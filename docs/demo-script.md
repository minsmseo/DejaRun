# Demo video script

Target length: 4 minutes 30 seconds (limit: under 5 minutes). Language: English. All data shown is fictional (Halden Materials Lab).

Run on the development site so far: scenes 2 and 3, the people area and both decisions of scene 4, the registry and the Confluence scan of scene 5 (the import itself was run in CCP), and both questions of scene 6. Not yet run through the UI: the filler change to 15 wt% in scene 4 and the CCP registration in scene 7; both follow from unit-tested engine behaviour but must be rehearsed before recording. Keys such as BAF-1 are the ones the demo data loader creates on an empty site; the new work item will get the next free key.

## Before recording

1. Load the demo data (Jira settings > Apps > DejaRun demo data).
2. In BAF, do **not** import the Confluence reports yet; scene 5 does that on camera.
3. Close work items created during earlier rehearsals, or start from a fresh site.
4. Browser at 100% zoom, sidebar collapsed, no other tabs.

## Scenes

| # | Time | On screen | Narration |
|---|---|---|---|
| 1 | 0:00 to 0:25 | Title card, then the BAF board with past experiments. | "In an R&D lab, experiment records live in personal reports and old tickets. When people move on, the records go with them, and failed experiments are rarely shared at all. So labs repeat experiments they have already run. DejaRun stops that, inside Jira and Confluence." |
| 2 | 0:25 to 1:10 | Create a work item in BAF: "Lap shear of BE-200 on aluminum with new mixing head". Open it, add the DejaRun panel, enter BE-200, lap shear, epoxidized soybean oil, 30 wt%, 10 wt%, **122 °C**, 60 min, aluminum. Save. | "A researcher plans a new lap shear test and enters the conditions. The form comes from the project's own schema. One click, and DejaRun checks them against every experiment on record." |
| 3 | 1:10 to 1:50 | The Duplicate banner. Scroll through the comparison table; pause on the cure temperature row (122 °C vs 120 °C, within ±5 °C). Show the findings of BAF-1 and its report link. Show the comment on the work item. | "Duplicate. Eight months ago someone ran this at 120 degrees, and it failed: the filler agglomerated and left voids. DejaRun is not matching keywords. It compares each condition, converts units, and applies the tolerance the lab set. Two degrees apart is the same cure. The assignee is told once, in a comment." |
| 4 | 1:50 to 2:25 | Expand "Ask the people who ran it". Then Edit conditions, change filler loading to 15 wt%, save: verdict becomes Similar. Choose Proceed with reason, type a reason, confirm. Then show the alternative on another work item: Link as repeat. | "Who can tell me more? The Teamwork Graph shows who wrote the report and what they work on now. The researcher changes the filler loading. Now it is Similar, not a duplicate, and they proceed with a reason on record. DejaRun does not block repeats. A deliberate reproduction is fine, as long as it is a decision." |
| 5 | 2:25 to 3:05 | Project page: the registry with its numbers. Import from Confluence tab: scan, five report-only experiments appear with conditions read from their tables (one logged in kelvin). Import. | "The registry shows every experiment and how many repeats were avoided. But many past experiments exist only as Confluence reports. DejaRun reads their conditions tables with code, no language model, and a person confirms the import. Now those results are found too." |
| 6 | 3:05 to 3:50 | Rovo Chat, Prior Run Agent: "Has anyone tested epoxidized soybean oil resin above 120 °C on aluminum?" Show the answer with links. Then: "Who ran BAF-4, and what are they working on now?" | "The same engine is behind a Rovo agent. It answers from the records, separates what failed from what worked, and links every claim to a work item or report. It never invents a result, and it cannot change a verdict. The actions are also an MCP server and a reusable skill." |
| 7 | 3:50 to 4:20 | Switch to the CCP project. Open DejaRun settings: a different schema (film thickness, humidity). Register a coating experiment, get a verdict. | "A coating team uses the same app with a completely different schema. Parameters, units, tolerances and thresholds are settings, not code." |
| 8 | 4:20 to 4:30 | Registry numbers, then end card with app name and "Runs on Atlassian". | "DejaRun. Find the experiment you are about to repeat, before you run it." |

## Values to type

| Field | Scene 2 | Scene 4 change | Scene 7 (CCP) |
|---|---|---|---|
| System | Bio-epoxy BE-200 | | Waterborne acrylic WA-5 |
| Test method | Lap shear test | | Pencil hardness |
| Resin type / Coating type | Epoxidized soybean oil | | Clear coat |
| Hardener ratio / Film thickness | 30 wt% | | 42 µm |
| Filler loading | 10 wt% | 15 wt% | |
| Cure temperature | 122 °C | | 82 °C |
| Cure time | 60 min | | 30 min |
| Substrate / Humidity | Aluminum | | 78 %RH |

Scene 7 gives a Duplicate of the WA-5 run that failed at high humidity (80 %RH, within ±10 %RH).

## Optional extra shot

Create a work item whose description contains a two-column table (System, Test method, parameter names and values). Within seconds, with no one opening the panel, DejaRun registers the conditions and comments if it is a Duplicate. Verified on the development site with cure temperature given as 433 K and cure time as 0.5 h.
