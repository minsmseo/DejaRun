/**
 * Demo scenario for DejaRun. Everything here is fictional: the organisation
 * (Halden Materials Lab), the product names, the conditions and the results
 * are invented for demonstration and do not describe any real formulation
 * or process.
 *
 * Each experiment is written as a compact row and expanded by `experiment()`.
 * `where` says where the experiment is recorded:
 *   'jira'        a work item with an experiment record
 *   'jira+report' the same, plus a Confluence report page linked from the record
 *   'report'      only a Confluence report page (found by the Confluence import)
 */

const experiment = (title, where, system, method, parameters, outcome, daysAgo, objective, findings, extra = {}) => ({
  title,
  where,
  system,
  method,
  parameters,
  outcome,
  daysAgo,
  objective,
  findings,
  ...extra,
});

/** Shorthand for a numeric value with its unit. */
const q = (value, unit) => ({ value, unit });
const c = (value) => ({ value });

const adhesive = (resin, hardener, filler, temperature, time, substrate) => ({
  resin_type: c(resin),
  hardener_ratio: q(hardener, 'wt%'),
  filler_loading: q(filler, 'wt%'),
  cure_temperature: temperature,
  cure_time: time,
  substrate: c(substrate),
});

const ESO = 'Epoxidized soybean oil';
const ELO = 'Epoxidized linseed oil';
const LIG = 'Lignin phenolic';
const BE200 = 'Bio-epoxy BE-200';
const BE310 = 'Bio-epoxy BE-310';
const LP10 = 'Lignin-phenolic LP-10';
const LAP = 'Lap shear test';
const PEEL = 'Peel test';

const ADHESIVE_EXPERIMENTS = [
  experiment('Lap shear of BE-200 on aluminum, 10 wt% filler, 120 °C cure', 'jira+report', BE200, LAP, adhesive(ESO, 30, 10, q(120, '°C'), q(60, 'min'), 'Aluminum'), 'failed', 240,
    'Check whether BE-200 with 10 wt% silica filler reaches the 8 MPa lap shear target on aluminum.',
    'Failed at 4.1 MPa against the 8 MPa target. The filler agglomerated at 10 wt% and left voids in the bond line, so the joint failed cohesively through the voids.'),
  experiment('Lap shear of BE-200 on aluminum, 20 wt% filler', 'jira', BE200, LAP, adhesive(ESO, 30, 20, q(120, '°C'), q(60, 'min'), 'Aluminum'), 'inconclusive', 205,
    'See whether more filler closes the gap to the lap shear target.',
    'Viscosity rose sharply at 20 wt% filler. Two of five coupons were starved of adhesive, so the 5.9 MPa mean has too much scatter to draw a conclusion.'),
  experiment('Lap shear of BE-200 on aluminum, 5 wt% filler', 'jira+report', BE200, LAP, adhesive(ESO, 30, 5, q(120, '°C'), q(60, 'min'), 'Aluminum'), 'success', 180,
    'Find a filler loading that disperses without agglomeration.',
    'Reached 9.2 MPa mean lap shear strength with cohesive failure and no voids. 5 wt% filler dispersed cleanly with the standard mixing step.'),
  experiment('High temperature cure of BE-200 on aluminum, 150 °C', 'jira+report', BE200, LAP, adhesive(ESO, 30, 10, q(150, '°C'), q(45, 'min'), 'Aluminum'), 'success', 150,
    'Test whether a hotter, shorter cure recovers strength at 10 wt% filler.',
    'Reached 8.6 MPa at 150 °C for 45 min. The bond met the target, but the resin yellowed visibly above 140 °C, which rules it out for visible joints.'),
  experiment('Hardener ratio study on BE-200, 35 wt%', 'jira', BE200, LAP, adhesive(ESO, 35, 10, q(140, '°C'), q(60, 'min'), 'Aluminum'), 'failed', 132,
    'Check whether more hardener speeds up the cure without losing strength.',
    'Failed at 3.8 MPa with adhesive failure at the aluminum surface. Excess hardener left the bond line brittle.'),
  experiment('Peel strength of BE-200 on steel', 'jira', BE200, PEEL, adhesive(ESO, 30, 10, q(120, '°C'), q(60, 'min'), 'Steel'), 'success', 120,
    'Qualify BE-200 for steel brackets.',
    'Peel strength 3.4 N/mm, above the 3.0 N/mm requirement. Grit blasting before bonding was necessary; untreated steel peeled cleanly.'),
  experiment('Lap shear of BE-310 on aluminum', 'jira+report', BE310, LAP, adhesive(ELO, 28, 8, q(130, '°C'), q(50, 'min'), 'Aluminum'), 'success', 96,
    'First strength check of the linseed based BE-310.',
    'Reached 10.1 MPa mean with cohesive failure. BE-310 wets aluminum better than BE-200 at the same filler loading.'),
  experiment('Peel strength of BE-310 on glass fiber composite', 'jira', BE310, PEEL, adhesive(ELO, 28, 8, q(130, '°C'), q(50, 'min'), 'Glass fiber composite'), 'inconclusive', 80,
    'Check BE-310 on composite panels.',
    'Results ranged from 1.9 to 3.6 N/mm depending on the panel batch. Surface release agent on some panels is suspected but was not measured.'),
  experiment('Lap shear of LP-10 on steel, 160 °C cure', 'jira+report', LP10, LAP, adhesive(LIG, 12, 15, q(160, '°C'), q(30, 'min'), 'Steel'), 'failed', 64,
    'Shorten the LP-10 cure cycle by raising the temperature.',
    'Failed: the bond line blistered. Volatiles released above 150 °C had no time to escape in a 30 min cycle, leaving 6.0 MPa against a 9 MPa target.'),
  experiment('Lap shear of LP-10 on steel, 140 °C cure', 'jira', LP10, LAP, adhesive(LIG, 12, 15, q(140, '°C'), q(45, 'min'), 'Steel'), 'success', 41,
    'Find a cure cycle for LP-10 that avoids blistering.',
    'Reached 9.4 MPa with no blistering at 140 °C for 45 min. This is the recommended cycle for LP-10 on steel.'),
  // Recorded only as Confluence reports.
  experiment('Unfilled BE-200 baseline on aluminum', 'report', BE200, LAP, adhesive(ESO, 30, 0, q(120, '°C'), q(60, 'min'), 'Aluminum'), 'success', 330,
    'Baseline strength of BE-200 without filler.',
    'Unfilled BE-200 reached 7.4 MPa. Slightly below target, which is why filler was introduced in later runs.'),
  experiment('Low temperature cure of BE-200, 100 °C', 'report', BE200, LAP, adhesive(ESO, 25, 10, q(100, '°C'), q(90, 'min'), 'Aluminum'), 'failed', 300,
    'Check whether BE-200 can be cured at 100 °C to save energy.',
    'Failed: the bond line was still tacky after 90 min at 100 °C. BE-200 does not fully cure below about 115 °C.'),
  experiment('BE-310 on steel, cure temperature logged in kelvin', 'report', BE310, LAP, adhesive(ELO, 28, 8, q(403.15, 'K'), q(50, 'min'), 'Steel'), 'success', 270,
    'Check BE-310 on steel with the oven that logs in kelvin.',
    'Reached 9.8 MPa on grit blasted steel. Oven setpoint was 403.15 K (130 °C).'),
  experiment('Peel strength of LP-10 on aluminum', 'report', LP10, PEEL, adhesive(LIG, 12, 10, q(150, '°C'), q(0.5, 'h'), 'Aluminum'), 'failed', 255,
    'Check LP-10 on aluminum.',
    'Failed at 1.2 N/mm. LP-10 does not bond to untreated aluminum; an adhesion promoter would be needed.'),
  experiment('Peel strength of BE-200 on aluminum', 'report', BE200, PEEL, adhesive(ESO, 30, 10, q(125, '°C'), q(60, 'min'), 'Aluminum'), 'inconclusive', 225,
    'Peel behaviour of BE-200 on aluminum.',
    'Peel values scattered between 2.1 and 3.3 N/mm. The fixture slipped on three coupons, so the run should be repeated with the new clamps.'),
  // Planned work, with a decision already taken.
  experiment('Repeat of LP-10 fast cure at 160 °C', 'jira', LP10, LAP, adhesive(LIG, 12, 15, q(158, '°C'), q(30, 'min'), 'Steel'), 'planned', 12,
    'Shorten the LP-10 cure cycle.', '', { decision: { type: 'linked_repeat', priorTitle: 'Lap shear of LP-10 on steel, 160 °C cure' } }),
  experiment('Reproduction of BE-200 5 wt% filler with resin batch 7', 'jira', BE200, LAP, adhesive(ESO, 30, 5, q(120, '°C'), q(60, 'min'), 'Aluminum'), 'planned', 6,
    'Confirm the 5 wt% filler result with the new resin batch.', '',
    { decision: { type: 'proceed_with_reason', priorTitle: 'Lap shear of BE-200 on aluminum, 5 wt% filler', reason: 'Deliberate reproduction: resin batch 7 comes from a new supplier lot and must be requalified before scale-up.' } }),
];

const coating = (type, thickness, temperature, time, humidity) => ({
  coating_type: c(type),
  film_thickness: q(thickness, 'µm'),
  cure_temperature: temperature,
  cure_time: time,
  humidity: q(humidity, '%RH'),
});

const WA5 = 'Waterborne acrylic WA-5';
const UU2 = 'UV-cure urethane UU-2';
const SG8 = 'Sol-gel hardcoat SG-8';
const PENCIL = 'Pencil hardness';
const CROSS = 'Cross-cut adhesion';

const COATING_EXPERIMENTS = [
  experiment('Pencil hardness of WA-5 clear coat, 80 °C cure', 'jira+report', WA5, PENCIL, coating('Clear coat', 40, q(80, '°C'), q(30, 'min'), 50), 'success', 210,
    'Baseline hardness of WA-5 at the standard cure.',
    'Reached pencil hardness 2H at 40 µm. Film was clear and free of pinholes.'),
  experiment('Pencil hardness of WA-5 clear coat at high humidity', 'jira+report', WA5, PENCIL, coating('Clear coat', 40, q(80, '°C'), q(30, 'min'), 80), 'failed', 190,
    'Check whether WA-5 tolerates humid conditions during cure.',
    'Failed: the film blushed white and only reached HB. Above about 70 %RH water is trapped in the film before it coalesces.'),
  experiment('Cross-cut adhesion of WA-5 clear coat', 'jira', WA5, CROSS, coating('Clear coat', 40, q(80, '°C'), q(30, 'min'), 50), 'success', 170,
    'Adhesion of WA-5 to primed steel.',
    'Cross-cut class 0, no flaking. Adhesion is not the limiting property of WA-5.'),
  experiment('Thick film WA-5 clear coat, 80 µm', 'jira', WA5, PENCIL, coating('Clear coat', 80, q(80, '°C'), q(30, 'min'), 50), 'failed', 150,
    'Check whether one thick coat can replace two thin coats.',
    'Failed: mud cracking across the panel at 80 µm. WA-5 should stay below about 55 µm per coat.'),
  experiment('Pencil hardness of UU-2 hardcoat', 'jira+report', UU2, PENCIL, coating('Hardcoat', 15, q(60, '°C'), q(2, 'min'), 45), 'success', 130,
    'Hardness of UU-2 after a short thermal flash and UV exposure.',
    'Reached 4H at 15 µm. The 2 min flash at 60 °C was enough to remove solvent before UV exposure.'),
  experiment('Cross-cut adhesion of UU-2 hardcoat on polycarbonate', 'jira', UU2, CROSS, coating('Hardcoat', 15, q(60, '°C'), q(2, 'min'), 45), 'inconclusive', 110,
    'Adhesion of UU-2 to polycarbonate sheet.',
    'Class 1 on one sheet supplier and class 3 on the other. The difference was not traced to a cause.'),
  experiment('Cross-cut adhesion of UU-2 primer', 'jira', UU2, CROSS, coating('Primer', 10, q(60, '°C'), q(2, 'min'), 45), 'success', 90,
    'Try UU-2 as its own primer layer.',
    'Class 0 with a 10 µm primer layer under the hardcoat. Recommended for polycarbonate.'),
  experiment('Pencil hardness of SG-8 hardcoat, 120 °C cure', 'jira+report', SG8, PENCIL, coating('Hardcoat', 5, q(120, '°C'), q(60, 'min'), 40), 'success', 70,
    'Hardness of the sol-gel coat at the supplier cure cycle.',
    'Reached 6H at 5 µm after 60 min at 120 °C.'),
  experiment('Short cure of SG-8 hardcoat, 20 min', 'jira', SG8, PENCIL, coating('Hardcoat', 5, q(120, '°C'), q(20, 'min'), 40), 'failed', 55,
    'Shorten the SG-8 cure to fit the line speed.',
    'Failed: only 2H after 20 min. Condensation of the sol-gel network is not complete below about 45 min at 120 °C.'),
  experiment('Cross-cut adhesion of SG-8 hardcoat', 'jira', SG8, CROSS, coating('Hardcoat', 5, q(120, '°C'), q(60, 'min'), 40), 'success', 35,
    'Adhesion of SG-8 on glass.',
    'Class 0 on cleaned glass.'),
  // Recorded only as Confluence reports.
  experiment('WA-5 primer hardness', 'report', WA5, PENCIL, coating('Primer', 25, q(80, '°C'), q(30, 'min'), 50), 'success', 320,
    'Hardness of WA-5 used as primer.',
    'Reached H at 25 µm, enough for a primer layer.'),
  experiment('WA-5 clear coat cured at 60 °C', 'report', WA5, PENCIL, coating('Clear coat', 40, q(60, '°C'), q(1, 'h'), 50), 'failed', 290,
    'Check whether WA-5 can be cured at 60 °C.',
    'Failed: film stayed soft (B) even after 1 h. WA-5 needs at least 75 °C to coalesce fully.'),
  experiment('UU-2 hardcoat at 30 µm', 'report', UU2, PENCIL, coating('Hardcoat', 30, q(60, '°C'), q(2, 'min'), 45), 'failed', 260,
    'Thicker UU-2 film for abrasion resistance.',
    'Failed: the film wrinkled. UV light did not cure through 30 µm, leaving the lower layer soft.'),
  experiment('SG-8 hardcoat cured at 150 °C', 'report', SG8, PENCIL, coating('Hardcoat', 5, q(423.15, 'K'), q(30, 'min'), 40), 'success', 240,
    'Faster SG-8 cure at higher temperature.',
    'Reached 6H after 30 min at 150 °C (oven logged 423.15 K). Only suitable for glass, not for polymer substrates.'),
  experiment('SG-8 hardcoat adhesion at high humidity', 'report', SG8, CROSS, coating('Hardcoat', 5, q(120, '°C'), q(60, 'min'), 75), 'inconclusive', 215,
    'Effect of humid application conditions on SG-8.',
    'Class 0 on two panels and class 2 on one. Humidity was not logged continuously, so the cause is open.'),
];

export const DEMO_ORGANISATION = 'Halden Materials Lab';

export const DEMO_PROJECTS = [
  {
    key: 'BAF',
    name: 'Bio-based Adhesive Formulation',
    description: 'Fictional adhesive formulation project of Halden Materials Lab. Demo data for DejaRun.',
    schemaExample: 'adhesive',
    experiments: ADHESIVE_EXPERIMENTS,
  },
  {
    key: 'CCP',
    name: 'Coating Cure Process',
    description: 'Fictional coating cure process project of Halden Materials Lab. Demo data for DejaRun.',
    schemaExample: 'coating',
    experiments: COATING_EXPERIMENTS,
  },
];
