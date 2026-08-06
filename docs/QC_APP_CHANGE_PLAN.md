# Rite Solar — Rooftop QC App

## Change Plan: converting the Solar Rooftop Operations app into a QC (Quality Check) app

**Prepared for:** Sarvesh, Rite Water Solutions (India) Limited
**Date:** 6 August 2026
**Repo analysed:** `D:\Solar-qc` — React 18 + TypeScript + Vite 6 + Tailwind + Firebase (Auth, Firestore, RTDB presence) + Cloudinary + PWA (vite-plugin-pwa, IndexedDB offline queue)
**Source checklist:** `RiteSolar_PostInstall_QA_Checklist_2.1.xlsx` — 54 check points, 7 sections, 21 Critical / 23 Major / 10 Minor, 24 photo-mandatory

### Decisions taken (confirmed)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | **QC-only.** Strip the sales pipeline (survey → proposal → field review → documents → backend) entirely. |
| 2 | Verdict | **Approver's manual call.** App computes and displays counts and flags Critical fails as advisory; the approver types the verdict. |
| 3 | Critical fails | **Submission allowed.** Fails are recorded with mandatory remark + photo; the approver decides. Rejection returns the job to the inspector as a numbered rework round with full history retained. |
| 4 | Deliverable | This change plan, for review before implementation. |

---

## 1. Executive summary

The app you have is a **sales pipeline tracker**, not an inspection tool. Structurally, though, it is a very good starting point: roughly **60% of the engineering you need already exists** — auth and invites, a dynamic form-template engine an admin can edit without a deploy, a mobile-first PWA shell, photo capture with client-side compression and Cloudinary upload, an IndexedDB offline queue with replay, a stage machine with audit history, denormalised counters for dashboards, and a generic Excel exporter.

What must change falls into five buckets:

1. **Amputation.** Seven pipeline stages, eight roles, and five large page/drawer components exist purely to serve the sales journey. They carry real weight — `TasksPage.tsx` is 71 KB, `TaskDetailDrawer.tsx` is 93 KB, `usePipelineActions.ts` is 51 KB — and none of it maps onto QC. Deleting them is the single largest quality win in this project.
2. **A richer checklist schema.** Your `FieldDefinition` carries six editable attributes beyond its id (`label, type, isRequired, options, sortOrder, unit`). A QC check point needs eleven more: `code`, `severity`, `verifyText`, `target`, `method`, `photoRequired`, `minPhotos`, `maxPhotos`, `allowNA`, `remarkRequiredOnFail`, and numeric `expectedMin`/`expectedMax`. Without severity there is no Critical-fail flagging; without `photoRequired` you cannot demand evidence on a Pass/Fail row (today photos only attach to a dedicated `photo_only` field).
3. **Sign-off — the genuinely new capability.** There is **zero signature code in the repo** (verified: no signature pad, no signature `FieldType`, no PDF library of any kind — the only `<canvas>` in the codebase is the JPEG compressor at `uploadToCloudinary.ts:121-126`, and the only match for "signature" is `fieldSignature`, a template-diffing string hash at `useTemplateActions.ts:77-89`). Two signature captures are needed — inspector and approver — plus an optional customer sign-off, each bound to an immutable audit record.
4. **A real approver role with server-side teeth.** Today `firestore.rules` checks roles but never inspects *which fields* a write touches. A field engineer can set `pipelineStage: 'completed'` on their own task. For an approval to mean anything in an audit, the rules must forbid the inspector from writing approval fields at all, and approvals must land in an append-only subcollection.
5. **A QC report artefact.** The whole point of a QC pass is a signed, dated, photo-backed certificate. The app currently generates no PDF whatsoever.

There are also **eight defects in the existing code** that will bite you harder in QC than they do in sales — silent deletion of an engineer's queued work after 5 failed attempts, base64 photos written into Firestore documents, a broken `taskNum` prefix search, a missing Firestore index that makes mobile-number search fail silently. These are catalogued in §11 and must be fixed as part of this work, not deferred.

**Recommendation on approach:** do this as a **fork on a new branch, in place, against a new Firestore project** (`ritesolar-qc`), not as an edit of the live sales app. The QC-only decision is destructive; you want the sales app's `main` intact and deployable while QC is built. Reuse the codebase, not the database.

---

## 2. Target workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ADMIN / QC MANAGER                                                     │
│                                                                         │
│  ① Upload closed-sale customers  ──►  CSV bulk import or single entry   │
│     (name, mobile, address, district/state, system size kW,             │
│      inverter make/model, installer/crew, installation date)            │
│                              │                                          │
│                              ▼                                          │
│  ② Create QC job  ──►  QC-0001, status = unassigned                    │
│     Snapshot the active qcTemplate onto the job (version-locked)        │
│                              │                                          │
│                              ▼                                          │
│  ③ Assign to QC Inspector  ──►  status = assigned                      │
│     (manual pick, or auto least-loaded)                                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  QC INSPECTOR (field, mobile, works offline)                            │
│                                                                         │
│  ④ Open job  ──►  status = in_progress                                  │
│     • Capture site GPS (one-touch, ≤30 m accuracy)                      │
│     • Walk 7 sections, 54 check points                                  │
│         – Pass / Fail / N/A per point                                   │
│         – Photo mandatory on 24 points (min 1, max 5)                   │
│         – Remark MANDATORY on every Fail                                │
│         – Photo MANDATORY on every Fail (evidence of the defect)        │
│         – Measured values on §5 (Voc, Isc, IR, earth resistance)        │
│     • Live counters visible: Pass / Fail / N/A, Critical fails flagged  │
│     • Save draft any time; resume later; queues offline                 │
│                              │                                          │
│  ⑤ Sign off  ──►  same form, bottom section                             │
│     • Inspector name + code (auto), date/time (server), GPS             │
│     • Draw signature on canvas  ──►  PNG to Cloudinary                  │
│     • Optional: customer signature + name (item 7.4)                    │
│     • Declaration checkbox                                              │
│                              │                                          │
│                              ▼                                          │
│  ⑥ Submit  ──►  status = pending_approval                               │
│     Blocked only on: unanswered required point, missing mandatory       │
│     photo, missing remark on a Fail, missing inspector signature.       │
│     Critical fails do NOT block submission.                             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  APPROVER                                                               │
│                                                                         │
│  ⑦ Review  ──►  read-only checklist + all photos + measurements        │
│     Advisory panel: 54 answered · 3 Fail · 2 CRITICAL FAIL · 1 N/A     │
│     Per-point approver comment where needed                             │
│                              │                                          │
│           ┌──────────────────┼──────────────────┐                       │
│           ▼                  ▼                  ▼                       │
│      ⑧a APPROVE        ⑧b APPROVE          ⑧c REJECT                   │
│         Verdict:          CONDITIONALLY        Reason (mandatory)       │
│         typed by          Verdict + the        + which points to        │
│         approver          conditions           re-check                 │
│         + signature       + signature          + optional reassign      │
│           │                  │                     │                    │
│           ▼                  ▼                     ▼                    │
│    status = approved   status = approved     status = rework            │
│    completedAt set     (conditional)         reworkRound += 1           │
│                              │                     │                    │
│                              ▼                     └──► back to ④,      │
│                    ⑨ QC COMPLETE                        prior round     │
│                       PDF certificate generated          preserved      │
│                       Job locked, read-only              read-only      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Status machine

| Status | Set by | Next |
|---|---|---|
| `unassigned` | admin on job creation | `assigned` |
| `assigned` | admin (assign) | `in_progress`, `unassigned` (unassign) |
| `in_progress` | inspector (first save) | `pending_approval`, `assigned` (reassign) |
| `pending_approval` | inspector (submit) | `approved`, `rework` |
| `rework` | approver (reject) | `in_progress` (inspector reopens) |
| `approved` | approver (approve / approve conditionally) | terminal — locked |
| `cancelled` | admin | terminal |

Six states, one linear path plus one loop. Compare with today's seven stages, three conditional branches, a single-slot `correctionReturnTo` pointer, and an admin override that can jump anywhere. **The simplification is the point** — it removes the entire class of counter-drift and pointer-collision bugs documented in §11.

---

## 3. Data model

### 3.1 New collection: `qcJobs`

Replaces `tasks`. Named separately so nothing inherits the 40+ optional sales fields on `Task`.

```ts
export type QcStatus =
  | 'unassigned' | 'assigned' | 'in_progress'
  | 'pending_approval' | 'approved' | 'rework' | 'cancelled';

export type QcVerdict = 'pass' | 'conditional' | 'reject';   // approver-typed
export type Severity  = 'critical' | 'major' | 'minor';
export type CheckStatus = 'pass' | 'fail' | 'na' | null;      // null = unanswered

export interface QcJob {
  id:            string;
  qcNum:         string;        // 'QC-000123'  — 6-digit pad, not 3 (see §11.3)
  status:        QcStatus;
  reworkRound:   number;        // 0 on first pass, incremented on each rejection

  // ── Customer & site (from the sales upload) ─────────────────────────
  customer: {
    name:          string;
    nameLower:     string;      // for prefix search
    nameWords:     string[];    // for array-contains word search
    mobile:        string;      // 10 digits, deduped
    altMobile?:    string;
    address:       string;
    district:      string;
    state:         string;
    pincode?:      string;
    salesRef?:     string;      // sales order / consumer no. from the closed sale
  };

  // ── System under inspection ─────────────────────────────────────────
  system: {
    sizeKw:            number;
    moduleMake?:       string;
    moduleWattage?:    number;
    moduleCount?:      number;
    inverterMake?:     string;
    inverterModel?:    string;
    inverterSerial?:   string;
    installationDate?: string;   // 'YYYY-MM-DD'
    installerCrew?:    string;
    systemType?:       'ongrid' | 'hybrid' | 'offgrid';
  };

  // ── Assignment ──────────────────────────────────────────────────────
  inspectorUid:    string | null;
  inspectorName:   string;
  inspectorCode:   string;
  inspectorMobile: string;
  approverUid:     string | null;   // null = any approver may pick it up
  approverName:    string;

  scheduledDate:  Date | null;
  dueDate:        Date | null;

  // ── Checklist (version-locked snapshot, exactly as tasks snapshot
  //    `fields` today — useTaskActions.ts:98) ──────────────────────────
  template:        QcFieldDefinition[];
  templateVersion: number;

  answers: Record<string, QcAnswer>;   // keyed by fieldId

  // ── Advisory tallies, recomputed on every save (client) and
  //    re-verified on submit (server-side, see §5.3) ───────────────────
  tally: {
    total:         number;
    answered:      number;
    pass:          number;
    fail:          number;
    na:            number;
    criticalFail:  number;
    majorFail:     number;
    minorFail:     number;
    suggestedVerdict: QcVerdict;   // ADVISORY ONLY — approver may type anything
  };

  // ── Site capture ────────────────────────────────────────────────────
  location:      { lat: number; lng: number; accuracy: number } | null;
  locationAt:    Date | null;

  // ── Sign-offs ───────────────────────────────────────────────────────
  inspectorSignOff: SignOff | null;
  customerSignOff:  SignOff | null;   // optional, covers checklist item 7.4
  approverSignOff:  SignOff | null;

  // ── Approver decision (INSPECTOR MUST NOT BE ABLE TO WRITE THESE) ───
  verdict:            QcVerdict | null;   // typed by the approver
  verdictNote:        string;             // approver's own words
  conditions:         string;             // required when verdict = 'conditional'
  rejectionReason:    string;             // required when status → 'rework'
  reworkPointIds:     string[];           // which check points to re-do
  approverComments:   Record<string, string>;   // fieldId → comment

  submittedAt:   Date | null;
  reviewedAt:    Date | null;
  completedAt:   Date | null;

  reportUrl:     string | null;   // generated PDF certificate
  reportedAt:    Date | null;

  createdBy:     string;
  createdAt:     Date;
  updatedAt:     Date;
  archived:      boolean;
  archivedAt:    Date | null;
  cancelReason:  string | null;
}
```

### 3.2 The check-point definition

```ts
export type QcFieldType =
  | 'passfail'          // ← the workhorse: Pass / Fail / N/A + remark + photos
  | 'measurement'       // numeric + unit + expected range (Voc, Isc, IR, ohms)
  | 'number' | 'text' | 'longtext' | 'select' | 'date'
  | 'photo_only'        // pure evidence block (before/after site photos)
  | 'signature'         // NEW — canvas pad
  | 'section_header';

export interface QcFieldDefinition {
  fieldId:     string;
  code?:       string;        // '1.1', '3.4' — the human reference from the xlsx
  label:       string;        // 'Structural material'
  type:        QcFieldType;
  sortOrder:   number;

  // ── QC-specific attributes (NONE of these exist today) ─────────────
  verifyText?:  string;       // 'Mounting structure is HDGI or aluminium — not
                              //  painted mild steel'   → shown under the label
  target?:      string;       // 'HDGI / Aluminium'
  method?:      string;       // 'Visual + material cert'  → shown as a chip
  severity?:    Severity;     // drives Critical-fail flagging + report ordering

  photoRequired?:  boolean;   // photo needed even to mark PASS
  minPhotos?:      number;
  maxPhotos?:      number;    // per-field, replaces the hardcoded 10 at
                              // ChecklistItem.tsx:131

  allowNA?:              boolean;   // some points are conditional (§5, §6)
  remarkRequiredOnFail?: boolean;   // default true
  photoRequiredOnFail?:  boolean;   // default true

  expectedMin?: number;       // measurement bounds — e.g. earth resistance ≤ 5 Ω
  expectedMax?: number;
  unit?:        string;       // 'Ω', 'V', 'A', 'MΩ', 'kW'

  showIf?: { fieldId: string; equals: string };  // conditional visibility
  isRequired: boolean;
  options:    string[];
}
```

`verifyText`, `target` and `method` are what turn a bare label into a checklist an inspector can actually follow on a roof without the Excel file open beside them. They come straight from columns C, D and E of your workbook.

### 3.3 The answer

```ts
export interface QcAnswer {
  fieldId:      string;
  code?:        string;
  status:       CheckStatus;      // pass | fail | na | null
  value?:       string;           // measurement / text / select value
  numericValue?: number;          // parsed, for range checking
  inRange?:     boolean;          // computed against expectedMin/Max
  remark:       string;
  photoUrls:    string[];
  answeredAt:   Date | null;
  answeredBy:   string;
  round:        number;           // which rework round produced this answer
}
```

### 3.4 Sign-off

```ts
export interface SignOff {
  role:          'inspector' | 'customer' | 'approver';
  name:          string;          // typed, defaults to the account name
  designation?:  string;
  uid:           string | null;   // null for the customer
  signatureUrl:  string;          // PNG on Cloudinary
  signedAt:      Date;            // serverTimestamp
  location:      { lat: number; lng: number; accuracy: number } | null;
  deviceInfo:    string;          // userAgent, for the audit trail
  declaration:   string;          // the exact text the signer accepted
}
```

### 3.5 Subcollections — the audit trail

`qcJobs/{id}/events/{autoId}` — **append-only, immutable, no client updates or deletes.** Every state change writes one event. This is what makes an approval defensible; today approvals would be plain field writes that either party could alter.

```ts
export interface QcEvent {
  id:        string;
  type: 'created' | 'assigned' | 'unassigned' | 'started' | 'draft_saved'
      | 'submitted' | 'approved' | 'approved_conditional' | 'rejected'
      | 'reopened' | 'cancelled' | 'template_changed' | 'report_generated';
  actorUid:  string;
  actorName: string;
  actorRole: UserRole;
  at:        Date;                 // serverTimestamp
  round:     number;
  note?:     string;
  snapshot?: {                     // tally + verdict at the moment of the event
    tally?:   QcJob['tally'];
    verdict?: QcVerdict | null;
    status?:  QcStatus;
  };
}
```

`qcJobs/{id}/rounds/{roundNumber}` — a frozen copy of `answers`, `tally`, `template` and the sign-offs for each completed round, written when the approver rejects. This is how you keep round 1's evidence intact while round 2 is being filled, without ballooning the parent document past Firestore's 1 MiB limit.

> **Document-size note.** 54 answers × (remark + up to 5 URLs) sits comfortably under 1 MiB *provided photos are URLs*. The existing offline path can write **base64 data URLs into the document** (`TaskQueueProcessor.tsx:66-73`, `PhotoZone.tsx:146-162`) — a single 1 MB photo blows the limit and fails the whole write. §11.1 makes this a blocking fix.

### 3.6 `appConfig/global` changes

| Remove | Add | Keep |
|---|---|---|
| `taskTemplate` | `qcTemplate: QcFieldDefinition[]` | `orgName` |
| `documentTemplate` | `qcTemplateVersion: number` | `districts`, `districtsByState`, `state` lists |
| `backendChecklistTemplate` (dead — exactly 3 references, zero consumers) | `qcNumCounter` | `superAdminUid` |
| `backendCashSteps`, `backendLoanSteps` | `inspectorCounts: Record<uid, {assigned, inProgress, submitted, approved, name}>` | `engineerNumCounter` → rename `inspectorNumCounter` |
| `taskNumCounter` | `approverCounts: Record<uid, {pending, approved, rejected, name}>` | |
| `pipelineCounts` (10 keys: 7 stages + 2 unassigned + total_active) | `qcCounts: Record<QcStatus, number>` + `criticalFailOpen: number` | |
| `saleClosedConfig` | `severityDefaults`, `declarationTexts: {inspector, customer, approver}` | |
| `memberCounts`, `proposalNumCounter`, `backendNumCounter` | | |

> **Counter hotspot — fix while you are here.** Every stage transition today writes `appConfig/global` inside its transaction (`usePipelineActions.ts`, ~14 call sites). Firestore sustains roughly **one write per second per document**; concentrating every job transition on one doc is a scaling wall and, worse, a *correctness* wall — the counter write is inside the transaction, so a contention failure aborts the QC submission itself. **Move counters to `qcStats/{shard}` with 5 shards, or drop live counters and use `getCountFromServer` on demand** (the app already does this in `useTabCounts`, `useTasks.ts:672-719`). Given your likely volume — tens of QCs a day, not thousands — I recommend **`getCountFromServer` with a 60 s cache and no denormalised counters at all**. It deletes several hundred lines of fragile increment/decrement logic and every drift bug in §11.

### 3.7 Firestore indexes

`firestore.indexes.json` currently holds **49 composite indexes on `tasks`**, several near-duplicates added reactively from console error links. Start clean for `qcJobs` — about **11** indexes cover every query in §4:

```
1.  status ASC, updatedAt DESC                       (queue lists)
2.  status ASC, dueDate ASC                          (overdue)
3.  inspectorUid ASC, archived ASC, updatedAt DESC   (my jobs)
4.  inspectorUid ASC, status ASC, updatedAt DESC     (my jobs by status)
5.  approverUid ASC, status ASC, updatedAt DESC      (my approvals)
6.  archived ASC, createdAt DESC                     (all / archive)
7.  archived ASC, customer.nameWords ARRAY, createdAt DESC   (name search)
8.  archived ASC, customer.mobile ASC                (mobile search)
9.  archived ASC, qcNum ASC                          (job-number search)
10. customer.district ASC, status ASC, updatedAt DESC (district reports)
11. tally.criticalFail DESC, status ASC, updatedAt DESC  (critical-fail queue)
```

**Declare the mobile-search index explicitly.** In the current app, `useStageTaskList.ts:190-194` issues `pipelineStage == + archived == + consumerMobile ==` and **no matching composite index is declared** in `firestore.indexes.json`. That query is equality-only with no `orderBy`, so Firestore may well serve it by merging single-field indexes — verify against the emulator before treating it as a live bug. Either way the index is undeclared and the error path is wrong: any failure is swallowed at `:214` and the user sees an empty result rather than an error. Index 8 above declares the QC equivalent.

---

## 4. Roles and permissions

### 4.1 New role set

| Role | Sees | Can do |
|---|---|---|
| `admin` | everything | upload customers, create/assign/cancel jobs, edit the QC template, manage users, all reports, force-reopen an approved job (audited) |
| `qc_manager` | everything, read-mostly | assign and reassign jobs, monitor dashboards, export reports. Cannot edit the template or manage users. |
| `qc_inspector` | only jobs where `inspectorUid == self` | fill the checklist, capture photos, capture GPS, sign off, submit, reopen a `rework` job |
| `approver` | all jobs in `pending_approval` / `approved` / `rework` | review, comment per point, type a verdict, sign off, approve / approve-conditionally / reject |
| `viewer` | everything | read-only + export. No writes anywhere. |

Five roles replacing eight. **Note the deliberate separation of `qc_inspector` and `approver`** — a single user account must not hold both, or the approval is meaningless. Enforce it in `CreateUserModal` and, more importantly, in the rules (§4.3).

### 4.2 The role-list problem — read this before you start

There is **no central role registry** in this codebase. The role list is hardcoded in **roughly 20 files and 60+ locations**. Inventory below — treat it as the starting sweep, not a guarantee of completeness; grep for each role string again after the refactor:

**Source of truth**
- `src/types/index.ts:3` — the `UserRole` union

**Routing**
- `src/App.tsx:57` — `requireAdmin` accepts `admin`, `view_only`
- `src/App.tsx:58-60` — `requireRole` exact match, or admin
- `src/App.tsx:61-69` — the `requireAdminOrField` redirect table. **A new role silently falls through to `/tasks`.**
- `src/App.tsx:100, 109, 118, 125-128` — per-route role strings

**Navigation — duplicated verbatim, both files must change**
- `src/components/layout/BottomNav.tsx:9-36` (item arrays), `:42-50` (role→items), `:52-56` (badges), `:61-64` (badge paths)
- `src/components/layout/SideNav.tsx:9-36, :42-50, :52-56, :67-70` — an **exact duplicate** of BottomNav

**Layout / listeners**
- `src/components/layout/Layout.tsx:16` — `role !== 'field'` gates the task listener
- `src/components/layout/Layout.tsx:45` — `admin|view_only` gates `useUsers()`

**Labels**
- `src/components/layout/Header.tsx:61` (badge colour), `:62-70` (role→display name, defaults to "Field Engineer")
- `src/pages/SignupPage.tsx:205-211` — invite role labels. **Already stale**: no `view_only` or `backend_manager` branch, so those users see a raw slug.

**User management**
- `src/components/team/CreateUserModal.tsx:122-127` — role `<SelectItem>`s (**omits `logistics` and `installation`**); `:34, 48, 132` — `'field'` default and the `role === 'field'` gate on state/district
- `src/hooks/useUserActions.ts:71-77` — `roleCodeMap` (code prefix + counter key); `:253-259` — a **second copy** of the same map; `:113-117, 145-149, 203-217, 265, 275, 292, 297-304, 317-328`
- `src/hooks/useUsers.ts:25` — `?? 'field'` default
- `src/pages/TeamPage.tsx:48` (`FilterTab` union), `:50-59` (`TABS`), `:88-93` (predicates), `:109-116` (per-role counts — a missing key renders `undefined` at `:230`)
- `src/components/team/UserCard.tsx` — holds another role dropdown

**Query gating**
- `src/hooks/useTasks.ts:180-184, 458, 678, 707`

**Pages**
- `src/pages/DashboardPage.tsx:188, 228, 236-237, 434, 465, 496`
- `src/pages/TasksPage.tsx:350, 522-523, 558, 811, 813, 1276`
- `src/pages/TemplatePage.tsx:581, 748, 851, 873, 961, 1095, 1148, 1741`
- `src/components/tasks/TaskDetailDrawer.tsx:41, 118, 213, 302, 422, 530, 899, 993, 1213, 1313-1314, 2131-2133`

**Other role gates (missed on the first sweep — illustrating the point)**
- `src/hooks/usePipelineActions.ts:1088` — `currentUser.role !== 'admin'` guards the stage override
- `src/firebase/initAppConfig.ts:607` — `role !== 'proposal' && role !== 'backend'`; note this file is in the §7 "rewrite substantially" list, so it will be touched

**Security rules**
- `firestore.rules:9-16` (one `isX()` helper per role), `:23-29`, `:41-49`, `:53-58`, `:63-68`, `:74-98`

**→ Action:** create `src/config/roles.ts` as the single source — the union type, display labels, badge colours, default landing route, nav items, and a `can(role, action)` capability map — and make every one of the sites above read from it. Do this **first**, in Phase 1, before writing any QC feature. Otherwise you will be chasing role bugs for the rest of the project.

**→ Also note:** role is read from the **custom claim first** (`useAuth.ts:24`, `getIdTokenResult(true)`), Firestore doc as fallback (`:57`); but `firestore.rules:6-8` reads only the **doc**. `changeRole` writes only the doc, which is why every toast says "must log out and back in" (`useUserActions.ts:271-274`). **There is no `functions/` directory in the repo** — only `scripts/generate-icons.mjs` — so nothing currently sets custom claims. Either add a Cloud Function that mirrors the doc role into the claim on write, or drop claims entirely and read the doc. Pick one; the split is a live inconsistency.

### 4.3 Firestore rules — the important part

Today's rules check roles but never inspect *which fields* a write touches. Concretely: **a `field` user who owns a task can set `pipelineStage: 'completed'`, `saleClosed: true`, `archived: true`, or `proposalAssignedTo` on it.** The entire pipeline is client-enforced. And `appConfig/{docId}` is writable by `field`, `proposal` and `backend` (`firestore.rules:23-29`) — meaning **any field engineer can rewrite the survey template or overwrite `superAdminUid`**. That grant exists only because clients do their own counter increments (`useTaskSubmit.ts:209`, `TaskQueueProcessor.tsx:307`). Dropping denormalised counters (§3.6) lets you close it.

For QC, the rules must do field-level authorisation. Sketch:

```js
rules_version = '2';
service cloud.firestore {
  function role() {
    return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
  }
  function active() {
    return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.active == true;
  }
  function touched() { return request.resource.data.diff(resource.data).affectedKeys(); }

  // Fields ONLY an approver may ever write
  function approverFields() {
    return ['verdict','verdictNote','conditions','rejectionReason','reworkPointIds',
            'approverComments','approverSignOff','reviewedAt','completedAt','status'];
  }
  // Fields ONLY an inspector may write
  function inspectorFields() {
    return ['answers','tally','location','locationAt','inspectorSignOff',
            'customerSignOff','submittedAt','status','updatedAt'];
  }

  match /databases/{database}/documents {

    match /qcJobs/{jobId} {
      allow read: if request.auth != null && active() && (
           role() in ['admin','qc_manager','approver','viewer']
        || (role() == 'qc_inspector' && resource.data.inspectorUid == request.auth.uid)
      );

      allow create, delete: if role() == 'admin';

      // Inspector: own job, only in a fillable state, only inspector fields,
      // and may only move status in_progress → pending_approval
      allow update: if role() == 'qc_inspector'
        && active()
        && resource.data.inspectorUid == request.auth.uid
        && resource.data.status in ['assigned','in_progress','rework']
        && touched().hasOnly(inspectorFields())
        && (!touched().hasAny(['status'])
            || request.resource.data.status in ['in_progress','pending_approval']);

      // Approver: only jobs awaiting review, only approver fields
      allow update: if role() == 'approver'
        && active()
        && resource.data.status == 'pending_approval'
        && touched().hasOnly(approverFields())
        && request.resource.data.status in ['approved','rework']
        // A verdict must be typed, and a rejection must carry a reason
        && request.resource.data.verdictNote is string
        && request.resource.data.verdictNote.size() > 0
        && (request.resource.data.status != 'rework'
            || request.resource.data.rejectionReason.size() > 0);

      // Manager: assignment only
      allow update: if role() in ['admin','qc_manager'] && active()
        && touched().hasOnly(['inspectorUid','inspectorName','inspectorCode',
             'inspectorMobile','approverUid','approverName','status',
             'scheduledDate','dueDate','archived','archivedAt','cancelReason',
             'reportUrl','reportedAt','updatedAt']);

      // Audit trail: append-only, forever
      match /events/{eventId} {
        allow read:   if request.auth != null && active();
        allow create: if request.auth != null && active()
                      && request.resource.data.actorUid == request.auth.uid;
        allow update, delete: if false;
      }
      match /rounds/{roundId} {
        allow read:   if request.auth != null && active();
        allow create: if role() in ['approver','admin'];
        allow update, delete: if false;
      }
    }

    // Template + config: admin only. No client counter writes anywhere.
    match /appConfig/{docId} {
      allow read:  if request.auth != null;
      allow write: if role() == 'admin';
    }

    match /users/{uid} {
      allow read:   if request.auth != null && (request.auth.uid == uid
                       || role() in ['admin','qc_manager']);
      allow create: if request.auth.uid == uid;   // fixes the signup deadlock, §11.6
      allow update: if role() == 'admin'
                    || (request.auth.uid == uid
                        && touched().hasOnly(['photoURL','fcmToken','fcmTokenUpdatedAt']));
      allow delete: if false;
    }
  }
}
```

Four properties this buys you, none of which hold today:

1. An inspector **cannot** write `verdict`, `approverSignOff` or `status: 'approved'`.
2. An approver **cannot** edit the answers they are reviewing.
3. An approval **cannot** be recorded without a typed verdict note.
4. The `events` trail is **immutable to every client, including admin**.

**Testing.** Add `@firebase/rules-unit-testing` and write a rules test suite — an inspector attempting `{verdict:'pass'}`, an approver attempting `{answers:{...}}`, a viewer attempting any write, a rejection with an empty reason. Without tests these rules will regress on the first "quick fix". This is the single highest-value test suite in the project.

---

## 5. Screens

### 5.1 Screen inventory

| Route | Roles | Replaces | Notes |
|---|---|---|---|
| `/login` | all | `LoginPage.tsx` | keep as-is |
| `/signup/:inviteId` | invitee | `SignupPage.tsx` | keep; fix labels (`:205-211`) and the rules deadlock (§11.6) |
| `/dashboard` | all | `DashboardPage.tsx` (39 KB) | **rewrite.** Per-role: inspector = my jobs by status + overdue; approver = pending queue + turnaround; admin/manager = throughput, critical-fail rate, per-inspector and per-district stats |
| `/jobs` | admin, manager, viewer | `TasksPage.tsx` (71 KB) | **rewrite.** Tabs: All / Unassigned / Assigned / In Progress / Pending Approval / Rework / Approved / Critical Fails / Overdue. Search by QC no., customer name, mobile |
| `/my-jobs` | inspector | — | **new.** Card list, offline-aware, big tap targets, sorted by due date |
| `/jobs/:id` | all | `TaskDetailDrawer.tsx` (93 KB) | **rewrite as a page, not a drawer.** A 54-point checklist plus photos and three sign-offs does not belong in a drawer |
| `/jobs/:id/fill` | inspector | `UpdateTaskDrawer.tsx` (30 KB) | **the core screen.** See §5.2 |
| `/approvals` | approver, admin | — | **new.** Pending queue, oldest first, critical-fail count badged per row |
| `/approvals/:id` | approver, admin | — | **new.** Read-only checklist + evidence + advisory panel + verdict form + signature |
| `/customers` | admin, manager | — | **new.** Closed-sale upload (CSV + single entry), dedupe on mobile, one-click "Create QC job" |
| `/template` | admin | `TemplatePage.tsx` (70 KB) | **major surgery.** Single QC checklist editor with the new attributes; delete the three-tab clone structure and the whole `ApplicationJourneyEditor` (`:360-563`) |
| `/team` | admin | `TeamPage.tsx` | update to the 5 roles via `roles.ts` |
| `/reports` | admin, manager, viewer | `ReportsPage.tsx` (30 KB) | **rewrite** around QC metrics; keep the Excel export machinery |
| `/error-logs` | admin | `ErrorLogsPage.tsx` | keep |

**Delete outright:** `ProposalPage.tsx`, `BackendPage.tsx`, `BackendManagerPage.tsx`, and the whole `src/components/pipeline/` directory (`BackendWorkDrawer.tsx` 58 KB, `ProposalWorkDrawer.tsx` 33 KB, `DocumentsWorkDrawer.tsx` 15 KB, `FieldReviewDrawer.tsx` 16 KB, `PipelineTracker.tsx`, `ProposalDocumentList.tsx`), plus `useProposalTasks.ts`, `useBackendTasks.ts`, `usePipelineActions.ts` (51 KB), `computeSaleClosed.ts`, `proposalDocuments.ts`, `proposalNoteLabel.ts`, `useEngineerTaskStats.ts` if unused. **The full delete list in §7 is 25 files totalling 497 KiB** (measured from the directory listing) — most of the app's complexity.

### 5.2 The QC fill screen — the heart of it

```
┌────────────────────────────────────────────────────────┐
│ ← QC-000123          Ramesh Patil · 5.4 kW      [⋮]   │  sticky header
│ Round 1 · In Progress                                  │
├────────────────────────────────────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  38/54                          │  sticky progress
│ ✓ 33 Pass   ✗ 3 Fail   ⊘ 2 N/A   ⚠ 2 CRITICAL        │  live tally
├────────────────────────────────────────────────────────┤
│ ⚑ Site location captured · ±12 m · 10:42       [Redo] │
├────────────────────────────────────────────────────────┤
│ ┌ 1. Structural & Mounting Integrity ──── 11/11 ✓ ──┐ │  collapsible
│ │                                                    │ │  section
│ │  1.1  Structural material          🔴 Critical     │ │
│ │  Mounting structure is HDGI or aluminium — not     │ │  verifyText
│ │  painted mild steel                                │ │
│ │  Target: HDGI / Aluminium  ·  🔍 Visual + cert    │ │  target + method
│ │                                                    │ │
│ │     ┌────────┐ ┌────────┐ ┌────────┐              │ │
│ │     │  PASS  │ │  FAIL  │ │  N/A   │              │ │  big tap targets
│ │     └────────┘ └────────┘ └────────┘              │ │
│ │                                                    │ │
│ │  📷 Photo required (1–5)      [ + Add photo ]      │ │
│ │     ┌────┐ ┌────┐                                  │ │
│ │     │ 🖼 │ │ 🖼 │                                  │ │
│ │     └────┘ └────┘                                  │ │
│ │  Remark (optional)                                 │ │
│ │  ┌──────────────────────────────────────────────┐ │ │
│ │  └──────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ┌ 3. Earthing & Safety Devices ──── 9/11 · 1 FAIL ──┐ │
│ │  3.3  Earth resistance             🔴 Critical     │ │
│ │  Earth resistivity measured with tester            │ │
│ │  Target: ≤ 5 Ω  ·  🔍 Earth tester                │ │
│ │  Measured: [  8.2  ] Ω    ⚠ Above target          │ │  live range check
│ │     ┌────────┐ ┌────────┐ ┌────────┐              │ │
│ │     │  PASS  │ │ ▓FAIL▓ │ │  N/A   │              │ │
│ │     └────────┘ └────────┘ └────────┘              │ │
│ │  ⚠ Remark required for a Fail                     │ │  mandatory
│ │  ┌──────────────────────────────────────────────┐ │ │
│ │  │ Earth pit dry, 8.2 Ω measured. Needs water   │ │ │
│ │  │ + salt charge and re-test.                    │ │ │
│ │  └──────────────────────────────────────────────┘ │ │
│ │  ⚠ Photo required for a Fail        [ + Add ]     │ │  mandatory
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ┌ SIGN-OFF ─────────────────────────────────────────┐ │
│ │  Inspector: Sarvesh Kulkarni (ENG-014)            │ │
│ │  Date: 06-Aug-2026 10:58 · GPS captured           │ │
│ │  ┌──────────────────────────────────────────────┐ │ │
│ │  │        (draw signature here)                  │ │ │  canvas pad
│ │  └──────────────────────────────────────────────┘ │ │
│ │                              [Clear]  [Confirm]   │ │
│ │  ☐ I certify the above inspection was carried     │ │
│ │    out by me at this site on the date shown.       │ │
│ │                                                    │ │
│ │  Customer sign-off (item 7.4)          [ Add ▾ ]  │ │
│ └────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────┤
│  [ Save draft ]          [ Submit for approval ]      │  sticky footer
└────────────────────────────────────────────────────────┘
```

Behaviour notes:

- **Autosave draft** every ~20 s and on every section collapse, plus on `visibilitychange` — an inspector on a roof will get interrupted. Keep the existing `initialisedForTaskId` guard pattern (`UpdateTaskDrawer.tsx:87-96`) so live Firestore snapshots never clobber in-progress edits.
- **Sections collapse** with a per-section progress chip. Fifty-four points in one flat scroll is unusable on a phone; the current `section_header`-as-divider approach (`ChecklistItem.tsx:39-54`) is not enough — you need real collapsible groups.
- **Submit blocks** only on: unanswered required point, missing mandatory photo, missing remark on a Fail, missing inspector signature, unchecked declaration. **Critical fails do not block** (your decision). Show a confirmation dialog naming the critical fails so the submission is deliberate.
- **Validation must be live, not submit-only.** Today validation runs *only* in `handleSubmit` and *only* when status is `completed` (`UpdateTaskDrawer.tsx:319-333`), so an inspector fills 54 points and then gets a wall of errors. Validate per-field on blur and show the count of outstanding issues in the sticky footer.
- **Drop the label-string auto-fill hacks.** `UpdateTaskDrawer.tsx:102-110` and `:191-222` match on lowercased labels — `"survey done date"`, `"roof length" × "roof width"`. Renaming a template label silently breaks the behaviour. If you need derived values, add an explicit `derivedFrom` attribute to `QcFieldDefinition`.

### 5.3 Signature capture — new component

`src/components/signature/SignaturePad.tsx`. Nothing like this exists in the repo.

- `<canvas>` with pointer events (covers mouse, touch and stylus in one code path); `touch-action: none` to stop the page scrolling under the finger
- Size the backing store to `devicePixelRatio` or signatures render blurry on phones
- `Clear` / `Undo last stroke` / `Confirm`
- Reject as empty if fewer than ~2 strokes or under ~50 px of total path length — stops accidental single-dot "signatures"
- On confirm: `canvas.toBlob('image/png')` → `new File(...)` → **reuse `uploadToCloudinary`** with a new `uploadType: 'signature'` → folder `ritesolar-qc/{qcNum}/signatures/{role}`
- **PNG, not JPEG** — transparent background, and never send a signature through the JPEG compression path in `uploadToCloudinary.ts:106-137` (`MAX_DIM 1200`, quality 0.8), which would mangle thin strokes. Add a `skipCompression` flag.
- **Offline:** cache as base64 in IndexedDB alongside the queued job, exactly as photos are handled — but see §11.1, the base64-into-Firestore bug must be fixed first or a signature will be written into the document body.
- Store `signatureUrl` + `signedAt` (**`serverTimestamp`**, never client time — a signature timestamp an inspector's device clock can set is worthless) + GPS + `userAgent` + the exact declaration text.

No third-party library needed; `react-signature-canvas` is an option but a ~120-line component avoids the dependency and gives you control over the empty-check and DPR handling.

### 5.4 Approver review screen

- **Read-only** rendering of the checklist, grouped by section, with Fails floated to the top of each section and Critical fails badged red
- Photo lightbox with swipe; show capture order and the job's GPS
- **Advisory panel** (your decision — advisory, not enforcing): `54 answered · 33 Pass · 3 Fail · 2 CRITICAL · 2 N/A`, with a computed suggestion — "Suggested: REJECT (2 critical fails)" — clearly labelled *Suggested*, and a link that jumps to each critical fail
- Per-point comment box (`approverComments[fieldId]`), collapsed by default
- **Verdict form:** a `<select>` for `pass | conditional | reject` **plus a mandatory free-text verdict note in the approver's own words**. Rules enforce non-empty (§4.3). `conditional` additionally requires `conditions`; `reject` requires `rejectionReason` and at least one `reworkPointIds` entry.
- Approver signature pad, same component
- Three buttons: **Approve** · **Approve with conditions** · **Reject & send for rework**
- On reject: freeze the round into `rounds/{n}`, `reworkRound += 1`, `status = 'rework'`, write the event, notify the inspector

### 5.5 Template editor

`TemplatePage.tsx` is 70 KB / 1,814 lines. Its bulk is `FieldRow` (`:109-355`), the admin migration tools (`:850-1180`), `ApplicationJourneyEditor` (`:360-563`) and `SaleClosedMappingEditor` (`:577-745`) — but ~150 of those lines are pure duplication: the survey and documents editors are **cloned state blocks** — `fields/dirty/expandedIdx/handleChange/handleAddField/handleDelete/handleMoveUp/handleMoveDown/handleSave` at `:754-757, 1164-1241`, cloned as `docFields/...` at `:759-762, 1243-1320`. Do not clone a third time. Extract one `<TemplateEditor template={...} onSave={...} />` and render it once.

Add editors for the new attributes: severity (3-way toggle), `verifyText` (textarea), `target`, `method`, `photoRequired` + min/max, `allowNA`, `remarkRequiredOnFail`, `expectedMin`/`expectedMax` + unit, `showIf`. Add **CSV/Excel import and export of the whole checklist** — you already maintain the checklist in Excel, so let an admin re-import a revised workbook rather than retyping 54 rows.

**Two traps in the existing save path:**

1. `fieldSignature` (`useTemplateActions.ts:77-86`) hashes only `fieldId|label|type|isRequired|options|unit`. **Every new attribute must be added there**, or an edit that only changes `severity` is seen as "no change" and never propagates.
2. `saveTemplate` (`:13-136`) re-materialises `fields` onto every open task. For QC, **do not do this** — a job's `template` is a version-locked snapshot and rewriting it mid-inspection changes the questions under the inspector's feet, which is an audit failure. Template changes must apply to **new jobs only**. Bump `qcTemplateVersion` and record it on each job.

### 5.6 Customer upload

Reuse `BulkTaskModal.tsx` as the shape, with three fixes:

- **Columns:** `customerName, mobile, altMobile, address, district, state, pincode, salesRef, systemSizeKw, moduleMake, moduleWattage, moduleCount, inverterMake, inverterModel, inverterSerial, installationDate, installerCrew, systemType, inspectorCode, scheduledDate`
- **Dedupe:** the current implementation fires **one Firestore query per row** inside `Promise.all` (`BulkTaskModal.tsx:153-172`) — a 500-row file is 500 reads and a burst that may hit limits. Replace with chunked `where('customer.mobile','in',[...10])` batches: 50 reads instead of 500.
- **Row cap and chunking:** there is currently **no row limit** and all valid rows go through in one call (`:228-232`). Cap at 500 per file, write in `writeBatch` chunks of 400, and **export an errors CSV** so the admin can fix and re-upload only the failed rows.
- Keep the intra-file dedupe (`:191-205`) and the per-row validation pattern (`:114-151`) — both are sound.

---

## 6. QC report (PDF certificate)

No PDF generation exists anywhere in the repo — verified against `package.json` and all of `src/`. This is net-new.

**Recommended:** `pdf-lib` + `@pdf-lib/fontkit` client-side. `jspdf` + `html2canvas` is faster to write but produces a raster PDF — unsearchable, huge with 24 photos, and it will not render `Ω`, `≤` or Devanagari.

**Structure** (apply Rite Solar branding — Solar Gold `#F7941D` accents, since this is a solar document):

1. **Cover** — Rite Water logo top-left; company name, address and CIN top-right; title "Post-Installation Quality Inspection Certificate"; QC number; verdict stamp (PASS green / CONDITIONAL amber / REJECT red); customer, site, system, inspection date
2. **Summary** — tally table, severity breakdown, the approver's typed verdict and note
3. **Checklist** — all 54 points by section: code, check point, target, method, severity, status, remark, photo references
4. **Non-conformances** — every Fail, Critical first, with remark and thumbnails
5. **Measurements** — §5 values against expected ranges
6. **Photo annexure** — 4-up grid, each captioned with check-point code and label
7. **Sign-offs** — the three signature images with name, designation, date/time and GPS
8. **Footer on every page** — `© Rite Water Solutions (India) Limited | Confidential | Page X of Y`

**Generate where?** Client-side is simplest and needs no backend. But a client can generate whatever it likes, so the certificate is not tamper-evident. **If the certificate goes to customers or DISCOM, generate it in a Cloud Function on approval** — triggered by the `approved` status write, output to Cloud Storage, `reportUrl` written back. Start client-side in Phase 5; move it server-side before the certificate is used externally.

**Also keep the Excel export.** `exportTasksToExcel.ts` sheet 2 is genuinely generic over `FieldDefinition` (`:72-142`) — union of fields by `fieldId`, dynamic photo columns, hyperlinked URLs. Adapt it; it is good code. Two fixes: rows are keyed by **header string** built from `field.label` while fields are deduped by `fieldId` (`:72-78, 122-123, 147-148`), so two points sharing a label collapse into one column — key by `fieldId` and set the header separately. Sheet 1's `!cols` array (`:160-167`) is hand-maintained and currently correct at 29 entries for 29 keys — keep them in sync, or derive the widths from the key list.

---

## 7. What to keep, change, delete

### Keep as-is
`firebase/config.ts` · `LoginPage.tsx` · `store/authStore.ts` · all of `components/ui/` (Radix wrappers, comboboxes, toast) · `useNetworkStatus.ts` · `usePresence.ts` · `useOnlineUsers.ts` · `OfflineBanner.tsx` · `logError.ts` · `ErrorLogsPage.tsx` · `districtUtils.ts` · `checkDuplicateMobile.ts` (retarget the collection) · PWA config in `vite.config.ts` · `tailwind.config.ts` (add QC status and severity colours) · `scripts/generate-icons.mjs`

### Rewrite substantially
`types/index.ts` · `App.tsx` (routes + role gates) · `BottomNav.tsx` + `SideNav.tsx` (deduplicate into one `<Nav variant>`) · `Header.tsx` · `Layout.tsx` · `DashboardPage.tsx` · `TasksPage.tsx` → `JobsPage.tsx` · `TemplatePage.tsx` · `ReportsPage.tsx` · `TeamPage.tsx` · `CreateUserModal.tsx` · `useUserActions.ts` · `initAppConfig.ts` · `firestore.rules` · `firestore.indexes.json` · `exportTasksToExcel.ts` · `uploadToCloudinary.ts` (folders, signature path, `skipCompression`) · `PhotoZone.tsx` (per-field min/max, `capture` attribute, fix the base64 fallback)

### Delete
`ProposalPage.tsx` · `BackendPage.tsx` · `BackendManagerPage.tsx` · all of `components/pipeline/` · `TaskDetailDrawer.tsx` · `UpdateTaskDrawer.tsx` · `usePipelineActions.ts` · `useProposalTasks.ts` · `useBackendTasks.ts` · `useStageTaskList.ts` · `useTasks.ts` · `useTaskActions.ts` · `useTaskSubmit.ts` · `computeSaleClosed.ts` · `proposalDocuments.ts` · `proposalNoteLabel.ts` · `taskScoring.ts` · `findLeastLoadedUser.ts` (rewrite far smaller if you want auto-assign) · `useEngineerTaskStats.ts` · `useBulkTaskActions.ts` (rewrite for customers)

### New files

```
src/config/roles.ts                          ← single role registry (build FIRST)
src/config/qcStatus.ts                       ← status labels, colours, transitions
src/types/qc.ts                              ← QcJob, QcAnswer, QcFieldDefinition, SignOff, QcEvent
src/firebase/qcTemplateSeed.ts               ← the 54-point default (delivered with this plan)
src/firebase/initQcConfig.ts                 ← idempotent seeder (see the trap below)
src/hooks/useQcJobs.ts                       ← list/subscribe/paginate by role
src/hooks/useQcJob.ts                        ← single job subscription
src/hooks/useQcJobActions.ts                 ← create, assign, cancel, archive
src/hooks/useQcFill.ts                       ← answer state, autosave, validation, tally
src/hooks/useQcSubmit.ts                     ← submit + event write
src/hooks/useQcApproval.ts                   ← approve / conditional / reject + round freeze
src/hooks/useQcOfflineQueue.ts               ← IndexedDB (rewrite of useTaskOfflineQueue)
src/hooks/useCustomerImport.ts               ← CSV parse, validate, dedupe, batch
src/utils/qcTally.ts                         ← pure tally + suggestedVerdict (unit-testable)
src/utils/qcValidation.ts                    ← pure submit-readiness check (unit-testable)
src/utils/generateQcReport.ts                ← pdf-lib certificate
src/utils/exportQcToExcel.ts                 ← adapted exporter
src/components/qc/QcCheckItem.tsx            ← one check point
src/components/qc/QcSection.tsx              ← collapsible section + progress chip
src/components/qc/QcTallyBar.tsx             ← sticky live counters
src/components/qc/QcJobCard.tsx
src/components/qc/QcStatusBadge.tsx
src/components/qc/SeverityBadge.tsx
src/components/qc/MeasurementInput.tsx       ← value + unit + range check
src/components/signature/SignaturePad.tsx    ← NEW capability
src/components/signature/SignOffBlock.tsx    ← pad + name + declaration + GPS
src/components/qc/VerdictForm.tsx            ← approver verdict + note + conditions
src/components/qc/EvidenceGallery.tsx        ← lightbox
src/components/customers/CustomerImportModal.tsx
src/components/customers/CustomerForm.tsx
src/pages/MyJobsPage.tsx
src/pages/JobsPage.tsx
src/pages/JobDetailPage.tsx
src/pages/QcFillPage.tsx
src/pages/ApprovalsPage.tsx
src/pages/ApprovalReviewPage.tsx
src/pages/CustomersPage.tsx
```

> **Seeding trap.** `initAppConfig` early-returns when the config doc already exists (`initAppConfig.ts:160-162`), so **adding a key to the `setDoc` payload at `:170-172` will never reach a live deployment.** `initQcConfig.ts` must be a separate idempotent seeder that checks for each key individually — model it on `initBackendJourneySteps` (`:335-356`).

---

## 8. Phased build order

| Phase | Scope | Output |
|---|---|---|
| **0 — Setup** | New branch. New Firebase project `ritesolar-qc` (dev + prod). `roles.ts` and `qcStatus.ts` as the single registries. Rewire every hardcoded role site from §4.2 to read from `roles.ts`. Delete the dead sales pages and `components/pipeline/`. | App builds, logs in, 5 roles route correctly, ~250 KB of source gone |
| **1 — Model & rules** | `types/qc.ts`. New `firestore.rules` with field-level authorisation. `firestore.indexes.json` rebuilt (11 indexes). `@firebase/rules-unit-testing` suite covering the four properties in §4.3. | Rules tests green. **This is the gate — do not build UI before it passes.** |
| **2 — Template** | `qcTemplateSeed.ts` (delivered). `initQcConfig.ts` idempotent seeder. Single `<TemplateEditor>` with all new attributes. Excel import/export of the checklist. Extend `fieldSignature`. | Admin can view and edit all 54 points; every `code`/`label`/`verifyText`/`target`/`method`/`severity`/`photoRequired` matches the workbook byte-for-byte (verified, zero diffs). Measurement bounds for 5.1–5.3 still to be supplied |
| **3 — Customers & jobs** | `CustomersPage` + CSV import (chunked dedupe, 500 cap, errors CSV). `useQcJobActions` create/assign. `JobsPage` with tabs and search. `MyJobsPage`. | Admin uploads a customer, creates QC-000001, assigns it; the inspector sees it |
| **4 — The fill screen** | `QcFillPage`, `QcSection`, `QcCheckItem`, `MeasurementInput`, `QcTallyBar`. Per-field photo min/max. Live validation. Autosave. GPS capture. `qcTally.ts` + `qcValidation.ts` with unit tests. | An inspector can complete all 54 points online with evidence |
| **5 — Sign-off** | `SignaturePad`, `SignOffBlock`. Cloudinary signature path + `skipCompression`. `serverTimestamp` on `signedAt`. Declaration texts in config. Submit → `pending_approval` + event write. | Inspector signs and submits; the job appears in the approver queue |
| **6 — Approval** | `ApprovalsPage`, `ApprovalReviewPage`, `EvidenceGallery`, `VerdictForm`, approver signature. Approve / conditional / reject. Round freeze into `rounds/{n}`. Rework loop back to the inspector. | **End-to-end workflow complete.** This is the MVP |
| **7 — Offline hardening** | `useQcOfflineQueue`. **Fix the base64-into-Firestore bug and the silent 5-attempt deletion (§11.1, §11.2).** Pending-queue badge with manual retry. Periodic retry with backoff. | An inspector completes a full QC in airplane mode; nothing is ever lost |
| **8 — Reports** | `generateQcReport.ts` (pdf-lib, Rite Solar branding). `exportQcToExcel.ts`. `ReportsPage` QC metrics. Dashboards per role. | Signed PDF certificate on approval; Excel and dashboard reporting |
| **9 — Polish** | Push notifications (`fcmToken` fields already exist on `User`). Rework-round diff view. Per-inspector scorecards. Installer/crew quality ranking. Server-side PDF in a Cloud Function. Custom-claims Cloud Function (§4.2). | |

**MVP = Phases 0–6.** Phase 7 is not optional for real field use — inspectors on rooftops will lose signal, and the current queue can silently delete their work.

---

## 9. The 54-point checklist as seeded data

`qcTemplateSeed.ts` accompanies this plan — generated directly from your workbook, no retyping, and type-checked clean under `strict`. Distribution:

| § | Section | Points | Critical | Major | Minor | Photo required |
|---|---|---:|---:|---:|---:|---:|
| 1 | Structural & Mounting Integrity | 11 | 5 | 6 | 0 | 5 |
| 2 | Electrical & Cable Management | 7 | 3 | 1 | 3 | 2 |
| 3 | Earthing (Grounding) & Safety Devices | 11 | 7 | 4 | 0 | 5 |
| 4 | Inverter & Commissioning Checks | 10 | 4 | 5 | 1 | 5 |
| 5 | Testing & Measurements (when fault occurs) | 4 | 2 | 2 | 0 | 3 |
| 6 | Documentation & Handover (at handover) | 7 | 0 | 4 | 3 | 2 |
| 7 | Site Cleanliness & Final | 4 | 0 | 1 | 3 | 2 |
| | **Total** | **54** | **21** | **23** | **10** | **24** |

Five points ship typed `'measurement'` rather than `'passfail'`, with unit and bounds where your standard fixes them: **3.3** earth resistance (Ω, `expectedMax: 5`), **4.3** production check (%, `expectedMin: 70`, `expectedMax: 80`), **5.1** Voc (V), **5.2** Isc (A), **5.3** insulation resistance (MΩ, placeholder `expectedMin: 1`). The inspector types the measured value, the app range-checks it live, and Pass/Fail still records the verdict. **5.1, 5.2 and 5.3 bounds are intentionally left for you to set** — Voc and Isc depend on the module datasheet and string length, and the IR minimum on your own standard.

Four refinements worth making to the checklist itself while it is being digitised:

1. **§5 is conditional** — titled "when Fault Occurs". Model it with `showIf`, or default all four points to `N/A` and prompt only when a §3 or §4 point fails. Otherwise inspectors will mark four points N/A on every job, which trains them to click past things.
2. **§6 is handover-time** — titled "at the time of handover". Either split QC into two visits (commissioning QC and handover QC) or accept that §6 will be `N/A` on a commissioning-day inspection. Worth deciding before rollout.
3. **Give the measurement points real bounds.** 3.3 earth resistance `expectedMax: 5` (Ω); 5.1 Voc and 5.2 Isc bounds derived from `system.moduleCount` and the module datasheet; 5.3 IR `expectedMin` per your standard. Then the app can flag out-of-range values live instead of relying on the inspector's judgement.
4. **4.3 production check** (70–80% of rated capacity) can be computed rather than judged — capture measured kW, divide by `system.sizeKw`, show the percentage against the band.

---

## 10. Effort estimate

| Phase | Work |
|---|---|
| 0 Setup, role registry, deletions | 3–4 days |
| 1 Model + rules + rules tests | 3–4 days |
| 2 Template editor | 4–5 days |
| 3 Customers + jobs | 4–5 days |
| 4 Fill screen | 6–8 days |
| 5 Sign-off | 3–4 days |
| 6 Approval | 4–5 days |
| **MVP subtotal** | **27–35 days** |
| 7 Offline hardening | 4–5 days |
| 8 Reports + PDF | 5–7 days |
| 9 Polish | 5–8 days |
| **Full subtotal** | **41–55 days** |

One developer familiar with this codebase. Add roughly 30% for UAT, field trial on real rooftops, and the fixes that trial will surface.

---

## 11. Existing defects that must be fixed as part of this work

These are all in the current code. Each matters more in QC than it does in sales, because a QC record is an audit document.

**11.1 — Base64 photos written into Firestore documents. (Blocking)**
`TaskQueueProcessor.tsx:66-73` — when a photo re-upload fails during replay, the function `return url`, writing the **base64 data URL into the document**. `PhotoZone.tsx:146-162` creates those data URLs on offline capture. A single ~1 MB photo breaches Firestore's 1 MiB document limit and fails the entire write; a smaller one silently persists hundreds of KB inside the record. With 54 points × up to 5 photos, QC will hit this constantly. **Fix:** never write `data:` URLs to Firestore. Keep blobs in IndexedDB, upload on reconnect, and fail the item back into the queue if upload fails.

**11.2 — Queued work is silently deleted. (Blocking)**
`TaskQueueProcessor.tsx:93-98` — at `attempts >= 5` the item is dequeued and dropped with only a `console.error`. An inspector's completed 54-point QC vanishes with no user-visible trace. **Fix:** a dead-letter store, a visible badge, and manual retry. There is no pending-queue UI anywhere today.

**11.3 — Job-number counter overflows at 999.**
`useTaskActions.ts:52-55` — `padStart(3,'0')`, so `T-1000` breaks the format and the prefix-range search. Use `padStart(6,'0')` for `qcNum`.

**11.4 — The number-prefix search is broken.**
`useTasks.ts:290-291, 309-310` — `where('taskNum','>=',X)` + `where('taskNum','<=', X + '')`. `X + ''` is a no-op concatenation, so the range collapses to exact equality. The intent was `X + '\uf8ff'`. The same bug is **deliberately propagated** to `useStageTaskList.ts:179-180`, where the comment says "Mirror the exact >= / <= '' pattern used in useTasks.ts".

**11.5 — An undeclared index, and a query error swallowed into an empty result.**
`useStageTaskList.ts:190-194` issues `pipelineStage == + archived == + consumerMobile ==`; **no matching composite index is declared** in `firestore.indexes.json`. Because the query is equality-only with no `orderBy`, Firestore may serve it from merged single-field indexes — so **confirm against the emulator before calling this a live failure.** What *is* certainly wrong is the error path: `:214-217` swallows any query error and sets `searchResults` to `[]`, so a real `failed-precondition` would present as "no results found". **Never swallow a query error into an empty list** — that is the defect to fix regardless.

**11.6 — Signup is denied by the rules as written.**
`firestore.rules:20` allows `users/{uid}` writes only `if isAdmin()`, but `SignupPage.tsx:99` has the newly created, role-less user `setDoc` their own document. At that moment `userRole()` resolves against a non-existent doc, so `isAdmin()` is false and the write is denied. Either signup is broken in production or the deployed rules differ from the file in the repo — **check which, because it means the repo's rules are not the rules in force.** §4.3 fixes it with `allow create: if request.auth.uid == uid`.

**11.7 — Client-side pagination under-fills pages.**
`useTasks.ts:505-511` (and its `loadMore` mirror at `:640-646`) filters a server-paginated result **client-side** for `unassigned`, `unassigned_backend` and `follow_up`. With 50 proposal tasks of which 3 are unassigned, the user sees 3 rows and must "load more" repeatedly. Put the filter in the query, or use a dedicated boolean field.

**11.8 — `loadMore` duplicates every filter's constraints.**
`useTasks.ts:573-632` re-declares every filter in a second switch (17 named cases + default) that must stay in sync with the one inside `buildAdminQuery` (declared at `:210`, switch at `:326-445`). Two sources of truth. `useStageTaskList.ts:138-159` does it correctly by reusing `buildConstraints()` — follow that pattern.

**Also worth fixing while adjacent:** unsigned Cloudinary uploads mean the cloud name and preset are in the client bundle and anyone can upload into your account (`uploadToCloudinary.ts:23-26`) — move to signed uploads via a Cloud Function, or at minimum set strict preset restrictions. `uploadToCloudinary` accepts `taskId`, `fieldId`, `photoType`, `index`, `fieldLabel` and **uses none of them** (`:11-21`) — pass them as Cloudinary `context`/`tags` so a photo can be traced to a check point without the Firestore document. Photo EXIF including GPS is destroyed by the canvas compression round-trip (`:106-137`) — for QC evidence, **burn a visible watermark** (QC number, check-point code, timestamp, GPS) onto the canvas before upload, and store lat/lng per photo in the answer. And `PhotoZone`'s file input has **no `capture` attribute** (`:316-323`), so an inspector can pick an old photo from the gallery — for evidence photos, set `capture="environment"`, and if gallery upload must be allowed, record which source was used.

---

## 12. Open questions

1. **One QC visit or two?** §6 (Documentation & Handover) and §5 (fault-time testing) suggest commissioning QC and handover QC are different events. Should the app model two job types with different templates?
2. **Who is the approver in practice** — a central QC head, or a regional approver per state/district? If regional, `approverUid` needs assignment rules and the approvals queue needs scoping.
3. **Does the customer sign in the app** (item 7.4, on the inspector's phone) or on paper that gets photographed? The app supports both; the first is better evidence.
4. **Is the PDF certificate given to the customer or to DISCOM?** If it leaves the company, generate it server-side (§6) so it is not client-forgeable.
5. **Does QC feed back into installer payment?** If an installer's retention is released on QC pass, the approval becomes a financial control and the audit requirements tighten further — worth knowing now.
6. **Rework SLA?** Should a `rework` job carry a target date and escalate to the QC manager when breached?
7. **Sales data source.** Is manual CSV upload the long-term answer, or will this eventually read from the existing sales app / ERP? If integration is likely, keep `customer` and `system` as a clean nested block (as specified) so it can be populated from an API without reshaping the document.

---

*Prepared by Claude for Rite Water Solutions (India) Limited · K-60, MIDC, Hingna Road, Nagpur – 440016 · CIN U29100MH2004PLC148812*
