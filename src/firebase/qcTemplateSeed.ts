// ─────────────────────────────────────────────────────────────────────────────
// src/firebase/qcTemplateSeed.ts
//
// Default Rite Solar Post-Installation QC checklist.
// Originally generated from RiteSolar_PostInstall_QA_Checklist_2.1.xlsx
// (54 points / 7 sections), then revised against a confirmed updated QA
// checklist: sections 5–7 removed entirely, section 3 restructured (two
// pairs of points merged into two new ones), and three standalone points
// dropped from sections 1/2/4.
//
//   29 check points across 4 sections
//   14 Critical · 13 Major · 2 Minor
//   13 points require a photo even to PASS
//   1 point is typed 'measurement' so the app can range-check the value
//     (4.3 production check — the only measurement field left; the other
//     4 all lived in the removed §3/§5 points)
//
// Seeded into appConfig/global.qcTemplate by initQcConfig() — which must check
// for the key individually, because initAppConfig early-returns on an existing
// config doc (initAppConfig.ts:160-162) and would never reach a live install.
// initQcConfig() only ever seeds a genuinely-absent qcTemplate key, though —
// it does nothing once one exists. Pushing this revision to an already-live
// appConfig/global goes through Phase 2's own saveQcTemplate path instead
// (Template → QC Checklist → Import, then Save), which version-locks
// in-flight jobs correctly and is the only path that bumps qcTemplateVersion
// on the live document.
//
// Admins edit this afterwards in Template → QC Checklist. A job version-locks
// its own copy at creation, so template edits (including this revision)
// apply to NEW jobs only — nothing here ever reaches back into a job that's
// already in progress.
// ─────────────────────────────────────────────────────────────────────────────
import type { QcFieldDefinition } from '@/types/qc';

export const QC_TEMPLATE_VERSION = 2;

export const DEFAULT_QC_TEMPLATE: QcFieldDefinition[] = [
  // ── 1. Structural & Mounting Integrity ──────────────────────────────────
  {
    fieldId: 'qc_sec_1', type: 'section_header', sortOrder: 0,
    label: '1. Structural & Mounting Integrity',
    isRequired: false, options: [],
  },
  {
    fieldId: 'qc_1_1', code: '1.1', type: 'passfail', sortOrder: 1,
    label: 'Structural material',
    verifyText: 'Mounting structure is Hot-Dip Galvanized Iron (HDGI) or aluminium — not painted mild steel',
    target: 'HDGI / Aluminium', method: 'Visual + material cert',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_2', code: '1.2', type: 'passfail', sortOrder: 2,
    label: 'Tilt & orientation',
    verifyText: 'Panels face true south (N. Hemisphere) at design tilt for max annual generation',
    target: 'True south; design tilt ±5°', method: 'Compass / app',
    severity: 'major', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_3', code: '1.3', type: 'passfail', sortOrder: 3,
    label: 'Roof penetrations sealed',
    verifyText: 'All anchor points sealed with polyurethane (or equivalent) waterproof sealant',
    target: 'No unsealed penetrations', method: 'Visual',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_4', code: '1.4', type: 'passfail', sortOrder: 4,
    label: 'Panel spacing / self-shading',
    verifyText: 'Sufficient inter-row spacing; no self-shading during low-sun hours',
    target: 'Per shadow analysis', method: 'Visual / measure',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_5', code: '1.5', type: 'passfail', sortOrder: 5,
    label: 'No walking / micro-crack damage',
    verifyText: 'Panel glass free of scratches, cracks, snail trails; crews never stepped on modules',
    target: 'No visible damage', method: 'Visual under reflection',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_6', code: '1.6', type: 'passfail', sortOrder: 6,
    label: 'Structure fastened',
    verifyText: 'Mounting structure securely fastened to roof/base',
    target: 'Firm, no movement', method: 'Manual push test',
    severity: 'critical', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_7', code: '1.7', type: 'passfail', sortOrder: 7,
    label: 'Torque',
    verifyText: 'All nuts and bolts tightened to specified torque',
    target: 'Per torque spec', method: 'Torque wrench',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_8', code: '1.8', type: 'passfail', sortOrder: 8,
    label: 'Corrosion protection',
    verifyText: 'Corrosion protection / anti-rust applied at cut edges & welds',
    target: 'Applied everywhere', method: 'Visual',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_9', code: '1.9', type: 'passfail', sortOrder: 9,
    label: 'Module clamps',
    verifyText: 'Correct mid/end clamps used; clamped within manufacturer\'s clamping zone',
    target: 'Within clamp zone', method: 'Visual / measure',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_1_11', code: '1.11', type: 'passfail', sortOrder: 10,
    label: 'Foundation concreting',
    verifyText: 'Concrete (PCC) cast for all foundation legs / base plates; fully set and level',
    target: 'All legs concreted', method: 'Visual',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  // ── 2. Electrical & Cable Management ────────────────────────────────────
  {
    fieldId: 'qc_sec_2', type: 'section_header', sortOrder: 11,
    label: '2. Electrical & Cable Management',
    isRequired: false, options: [],
  },
  {
    fieldId: 'qc_2_1', code: '2.1', type: 'passfail', sortOrder: 12,
    label: 'Conduit protection',
    verifyText: 'All DC & AC cables run through rigid UV-resistant PVC (RPVC) or metal conduit',
    target: 'No loose/exposed wiring', method: 'Visual',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_2_2', code: '2.2', type: 'passfail', sortOrder: 13,
    label: 'MC4 connectors',
    verifyText: 'Panel-to-panel joins use proper crimped & locked MC4 connectors — no taped joints',
    target: 'Genuine MC4, locked', method: 'Visual / pull test',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_2_3', code: '2.3', type: 'passfail', sortOrder: 14,
    label: 'Cable sag / dressing',
    verifyText: 'Wiring neatly tied to racking rails with UV-resistant cable ties; no roof contact',
    target: 'No sag / roof contact', method: 'Visual',
    severity: 'minor', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_2_4', code: '2.4', type: 'passfail', sortOrder: 15,
    label: 'Cable size',
    verifyText: 'DC & AC cable sizing correct for current & voltage-drop limits',
    target: 'Voltage drop < 3%', method: 'Design doc / measure',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_2_5', code: '2.5', type: 'passfail', sortOrder: 16,
    label: 'DC string polarity',
    verifyText: 'String polarity verified correct (no reverse connections)',
    target: 'Correct polarity', method: 'Multimeter',
    severity: 'critical', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  // ── 3. Earthing (Grounding) & Safety Devices ────────────────────────────
  // Restructured, not just trimmed: 3.2 / old-3.3 (earth resistance) /
  // old-3.4 / old-3.5 removed outright; old-3.6+3.7 merged into a fresh
  // field (new display code 3.3); old-3.8/3.9 keep their original
  // fieldIds and content unchanged — only their displayed code moved (to
  // 3.4/3.5); old-3.10+3.11 merged into a fresh field (new display code
  // 3.6). Fresh fieldIds for the two merged items — "3.3" and "3.6"
  // already meant something else on every job created before this
  // change, so reusing either would collide two unrelated meanings under
  // one identifier.
  {
    fieldId: 'qc_sec_3', type: 'section_header', sortOrder: 17,
    label: '3. Earthing (Grounding) & Safety Devices',
    isRequired: false, options: [],
  },
  {
    fieldId: 'qc_3_1', code: '3.1', type: 'passfail', sortOrder: 18,
    label: 'DC-side earthing',
    verifyText: 'Panel frames & mounting structure earthed (separate earth line)',
    target: 'Continuous bond', method: 'Visual + continuity',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_3_dcdb_acdb', code: '3.3', type: 'passfail', sortOrder: 19,
    label: 'DCDB & ACDB present',
    verifyText: 'Dedicated DC & AC Distribution Box installed, IP-rated, UV-protected',
    target: 'Installed & rated', method: 'Visual',
    severity: 'major', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_3_8', code: '3.4', type: 'passfail', sortOrder: 20,
    label: 'Lightning arrestor',
    verifyText: 'Lightning arrestor installed & earthed (if in design scope)',
    target: 'Installed if in scope', method: 'Visual',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_3_9', code: '3.5', type: 'passfail', sortOrder: 21,
    label: 'MC4 crimping',
    verifyText: 'MC4 connectors properly crimped, locked and UV-protected',
    target: 'Crimped & locked', method: 'Visual / pull',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_3_isolators', code: '3.6', type: 'passfail', sortOrder: 22,
    label: 'DC & AC isolator',
    verifyText: 'DC isolator installed and functional (isolates array on demand); proper AC isolator installed between inverter and grid/load',
    target: 'Functional', method: 'Switch test / Visual',
    severity: 'critical', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  // ── 4. Inverter & Commissioning Checks ──────────────────────────────────
  {
    fieldId: 'qc_sec_4', type: 'section_header', sortOrder: 23,
    label: '4. Inverter & Commissioning Checks',
    isRequired: false, options: [],
  },
  {
    fieldId: 'qc_4_1', code: '4.1', type: 'passfail', sortOrder: 24,
    label: 'Location & ventilation',
    verifyText: 'Inverter in shaded, well-ventilated area; not in direct sun / enclosed heat',
    target: 'Shaded, ventilated', method: 'Visual',
    severity: 'major', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_2', code: '4.2', type: 'passfail', sortOrder: 25,
    label: 'Mounting',
    verifyText: 'Inverter firmly wall-mounted at correct height with clearance around it',
    target: 'Firm; clearance OK', method: 'Visual',
    severity: 'minor', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_3', code: '4.3', type: 'measurement', sortOrder: 26,
    label: 'Production check',
    verifyText: 'At clear-sky noon, output is 70–80% of rated capacity (after losses)',
    target: '70–80% of rated kW', method: 'Inverter display / app',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    unit: '%', expectedMin: 70, expectedMax: 80,   // Noon output as % of rated capacity
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_4', code: '4.4', type: 'passfail', sortOrder: 27,
    label: 'Anti-islanding test',
    verifyText: 'Switch off grid breaker — inverter shuts down within seconds',
    target: 'Trips within seconds', method: 'Live test',
    severity: 'critical', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_5', code: '4.5', type: 'passfail', sortOrder: 28,
    label: 'Utility settings configured',
    verifyText: 'Inverter grid/protection settings configured as per utility (DISCOM) requirements',
    target: 'Per utility spec', method: 'Inverter menu',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_6', code: '4.6', type: 'passfail', sortOrder: 29,
    label: 'Starts without alarms',
    verifyText: 'Inverter powers up and starts without alarms; generation verified',
    target: 'No alarms; generating', method: 'Inverter display / app',
    severity: 'critical', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_7', code: '4.7', type: 'passfail', sortOrder: 30,
    label: 'No fault / error codes',
    verifyText: 'Inverter display shows no active fault, fault or warning codes',
    target: 'No active faults', method: 'Inverter display',
    severity: 'critical', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_8', code: '4.8', type: 'passfail', sortOrder: 31,
    label: 'Grid parameters',
    verifyText: 'Grid voltage & frequency within window; inverter syncing normally',
    target: 'Within limits', method: 'Inverter display',
    severity: 'major', photoRequired: false,
    minPhotos: 0, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
  {
    fieldId: 'qc_4_9', code: '4.9', type: 'passfail', sortOrder: 32,
    label: 'Monitoring / RMS live',
    verifyText: 'Remote monitoring (RMS/app/Wi-Fi/GSM) commissioned and reporting data',
    target: 'Live on portal/app', method: 'App / portal',
    severity: 'major', photoRequired: true,
    minPhotos: 1, maxPhotos: 5,
    isRequired: true, allowNA: true, remarkRequiredOnFail: true,
    photoRequiredOnFail: true, options: [],
  },
];

// ── Declaration texts shown above each signature pad ─────────────────────────
// Stored in appConfig/global.declarationTexts so legal can revise them without
// a deploy. The exact text a signer accepted is copied into SignOff.declaration.
export const DECLARATIONS = {
  inspector:
    'I certify that the above inspection was carried out by me at this site on ' +
    'the date and time shown, and that the recorded observations, measurements ' +
    'and photographs are a true record of the installation as found.',
  customer:
    'I confirm that the installation was shown to me, that the system operation, ' +
    'shutdown procedure and cleaning instructions were explained to me, and that ' +
    'I have received the handover documents listed above.',
  approver:
    'I have reviewed the inspection record and the supporting evidence in full ' +
    'and record the verdict stated above.',
} as const;
