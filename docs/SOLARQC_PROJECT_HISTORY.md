# SolarQC — Project History and Handover

A record of what has been built in the Rite Solar QC app, how it works, what it needs to run, and what is still pending.

**Sources.** Everything here was taken from the repository: `git log` on `qc-conversion`, the code, `docs/QC_APP_CHANGE_PLAN.md`, `firestore.rules`, `firestore.indexes.json`, `database.rules.json`, `firebase.json`. Nothing was checked against live Firebase or Cloudinary. Where a claim comes from a commit message and not from reading the code, or cannot be verified from the repo, the text says so.

**Written at:** HEAD `d9b076f` (2026-08-19). See §13 for what was uncommitted at the time.

---

## 1. Overview

SolarQC is a mobile-first, installable PWA for post-installation quality-control (QC) inspections of rooftop solar systems. It was converted from **SolarOps**, an internal sales-pipeline tracker for the same company. The sales pipeline was removed entirely (QC-only scope, decision #1 in the change plan). The auth, form-template engine, photo capture, offline plumbing and Excel tooling were kept.

**Workflow in one paragraph.** An admin or QC manager registers a customer (single entry or CSV) and creates a QC job from it. The job gets a number (`QC-000001`, …) and a version-locked copy of the current checklist. It is assigned to an inspector. The inspector walks the checklist on site (Pass / Fail / N/A, remarks, photos, GPS, DCR panel serials), signs, and submits. An approver reviews, types a verdict and signs: approve, approve conditionally, or reject. A reject returns the job to the inspector as a new numbered rework round. An approved job can have a PDF certificate generated and exported.

**Who uses it.** Five roles: Admin, QC Manager, QC Inspector, Approver, Viewer (§6).

| Item | Value |
|---|---|
| Firebase project | `solarqc` (`.firebaserc` default) |
| Live URL | **Not recorded anywhere in the repo.** Firebase Hosting serves `dist/` for the `solarqc` project; the default Hosting domain is normally `https://<project-id>.web.app`. Confirm the actual URL in the Firebase console. |
| Repo | Local path `D:\Solar-qc`. Remotes: `origin` (the original sales app, branch `main`) and `qc` (`qc/qc-conversion`). The GitHub URLs are not recorded in this document. |
| Working branch | `qc-conversion` (`main` is the untouched sales app) |
| Package name | `solarqc` |

---

## 2. Tech stack

Versions are the ranges in `package.json`. The exact installed versions are in `package-lock.json`.

| Area | Technology |
|---|---|
| UI | React `^18.3.1`, TypeScript `^5.7.2`, React Router `^7.1.1` |
| Build | Vite `^6.0.7`, `@vitejs/plugin-react`, `vite-plugin-pwa ^0.21.1` (Workbox), Tailwind CSS `^3.4.17`, PostCSS, autoprefixer |
| UI kit | Radix UI primitives (dialog, dropdown-menu, label, scroll-area, select, slot), `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge` |
| State | `zustand ^5` |
| Backend | Firebase JS SDK `^10.14.1`: Auth, Firestore (persistent multi-tab local cache), Realtime Database (presence only), Hosting |
| Media | Cloudinary, **unsigned** uploads from the browser (`uploadToCloudinary.ts`) |
| Offline | Firestore `persistentLocalCache`, Workbox precache, IndexedDB via `idb ^8` for the photo/signature upload queue |
| Documents | `pdf-lib ^1.17.1` + `@pdf-lib/fontkit ^1.1.1` (certificate, with Noto Sans embedded from `public/fonts/`); `xlsx ^0.18.5` (Excel); `papaparse ^5.5.3` (CSV) |
| Charts | `recharts ^2.15` |
| Tests | `vitest 4.1.10`, `@firebase/rules-unit-testing 3.0.4` (pinned; the latest major needs Firebase v12) |
| Images/icons | `sharp ^0.35.1` (dev; `generate-icons` script) |

There are **no Cloud Functions and no server code**. The app is client-side only (§5).

---

## 3. Requirements to run and develop

**Node.** Not pinned: there is no `engines` field in `package.json` and no `.nvmrc`. Vite 6 needs a current LTS Node (18+ at minimum, 20+ recommended). That is general guidance, not something the repo enforces.

**Firebase CLI.** Needed for deploys and for `npm run test:rules` (`firebase emulators:exec`). Install it globally and run `firebase login`. The default project alias is `solarqc`.

**Java / JDK.** Needed by the Firestore emulator, so by `npm run test:rules`. Phase 1 installed Microsoft OpenJDK 21 on one machine; a later commit (`6d266d3`) records that the suite could not be run there for lack of Java. See §11.

**Environment variables.** Create `.env.local` (git-ignored). Names only, never commit values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`
- `VITE_USE_EMULATORS` — set to `true` only to point the app at the local Auth (`:9099`) and Firestore (`:8080`) emulators.

**npm scripts** (every one in `package.json`):

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b && vite build`. **Rewrites the tracked file `tsconfig.app.tsbuildinfo`** as a side effect. |
| `npm run lint` | `eslint .`. **Does not work:** ESLint is not installed and no ESLint config exists in the repo. |
| `npm run preview` | Serves the built `dist/` locally |
| `npm run generate-icons` | `node scripts/generate-icons.mjs` — regenerates favicon and the 8 PWA icon sizes from `public/logo/rite-solar-icon-mark-512.png` using `sharp` |
| `npm run test:rules` | Starts the Firestore emulator and runs `tests/firestore-rules.test.ts` (needs Java) |
| `npm run test:unit` | `vitest run tests/qcTally.test.ts tests/qcValidation.test.ts`. Pure functions, no emulator. |

---

## 4. Timeline of work

All dates are commit dates from `git log`. Hashes are short hashes on `qc-conversion`.

### 4.0 Before the QC conversion (SolarOps, the sales app)

These commits are the inherited sales-pipeline app, not QC work. They are listed so the history is complete.

| Date | Commit | Summary |
|---|---|---|
| 2026-06-23 | `f4eb0d4` | Initial commit |
| 2026-07-01 → 07-16 | `8392120`, `0ba19e0`, `889bd4e`, `01f545a`, `07deb26`, `7fcb0c8`, `d136696`, `406bc81`, `a0076e4`, `a408ffc` | Deployments and fixes to the sales app: proposals, team page, offline survey form, admin task creation, plus two extra roles (View Only, Backend Manager) |
| 2026-08-06 | `7b55d73` | Last sales-app feature commit: "Sales Closed" auto-detection, clickable dashboard cards, extra Firestore indexes |
| 2026-08-06 | `459df3c` | **Start of the conversion.** Firebase alias pointed at `solarqc`; `docs/QC_APP_CHANGE_PLAN.md` added |

### 4.1 Phases 0–8 (the planned build, 2026-08-07 → 08-10)

The nine-phase plan is in `docs/QC_APP_CHANGE_PLAN.md` §8. Phases 0–6 are the MVP; 7–8 followed.

| Phase | Date | Commit(s) | What changed and why |
|---|---|---|---|
| **0 — Setup, role registry** | 2026-08-07 | `3c5aa9d` | Created `src/config/roles.ts` (single role registry: five roles, capabilities, nav items, default routes) and `src/config/qcStatus.ts`. Rewired every hardcoded role check in the app (routing, nav, headers, user management) to read from the registry. `ProtectedRoute` now takes one `allow` list. Merged the duplicated `BottomNav`/`SideNav` into `Nav.tsx`. Deleted about 25 files of sales-pipeline-only code and the five one-time sales-data migration handlers. Employee-code prefixes: `INS`, `APR`, `MGR`. |
| **1 — Data model, rules, indexes** | 2026-08-07 | `d5960d6`, `4794781` | `src/types/qc.ts` (QcJob, QcFieldDefinition, QcAnswer, SignOff, QcEvent, QcRound). Full rewrite of `firestore.rules` with field-level authorisation on `qcJobs`, an append-only `events` subcollection, and a fix for the signup deadlock. Added the 11 `qcJobs` composite indexes. Introduced the test setup: `tests/firestore-rules.test.ts`, `npm run test:rules` (57 tests at that point). `4794781` removed a duplicate `tasks` index that made the first indexes deploy fail with a 409. |
| **2 — Template editor, Excel import/export** | 2026-08-07 | `843b0e8` | `qcTemplateSeed.ts` moved into `src/` so it is type-checked. `initQcConfig.ts` is an idempotent seeder that only seeds an *absent* `qcTemplate`. New `TemplateEditor.tsx` covering every attribute. `qcTemplateExcel.ts` imports/exports the checklist *definition* (whole file rejected on any bad row). `saveQcTemplate` with `qcFieldSignature()` so a severity-only edit counts as a change. Retired the dead sales editors. |
| **3 — Customers, jobs, assignment** | 2026-08-07 | `ca6c72f`, `ff37657` | `CustomersPage` (CSV import and single entry), `JobsPage` (status tabs, search), `MyJobsPage`, `useQcJobActions` (create/assign/unassign/archive), `useQcJobs` (role-aware; inspector queries always filter by `inspectorUid`). One transaction reserves the `qcNum` and snapshots the template. Bulk import reserves one contiguous block of numbers. Rules fix: `managerFields()` could previously push a job straight to `approved` or `rework`; now limited to unassigned↔assigned. **`ff37657` — admin create-user rule fix:** the Phase 1 rules had dropped "admin can create any user's doc", so `/team` → Add User failed with permission-denied. Restored, with regression tests. |
| **4 — Inspector fill screen** | 2026-08-07 | `d357beb` | `QcFillPage` at `/jobs/:id/fill`: Pass/Fail/N/A, measurement input, remarks, photos, live tally bar, live validation, autosave (about 20 s, section collapse, `visibilitychange`), one-shot GPS. Pure functions `qcTally.ts` and `qcValidation.ts` with unit tests. `PhotoZone` retargeted to QC; uploads go to `ritesolar-qc/{qcNum}/{fieldId}` with `capture="environment"`. The base64-into-Firestore offline fallback was removed (plan defect §11.1). |
| **5 — Sign-off and submit** | 2026-08-08 | `3e64e9e` | `SignaturePad` (canvas, pointer events, rejects trivially short strokes), `SignOffBlock` (inspector mandatory, customer optional), fresh GPS per signature, signatures uploaded as PNG without compression. `submitQcJob` is one `writeBatch` (job update + audit event). Submit gate: zero validation issues; critical fails trigger a confirmation dialog but do not block. Fixed a Timestamp→Date decode bug on nested `signedAt`. |
| **6 — Approval, verdict, rework** | 2026-08-08 | `782bd43` | `ApprovalsPage`, `ApprovalReviewPage` (`/approvals/:id`), `VerdictForm`, `EvidenceGallery`, `SingleSignOff`. `submitVerdict` is one batch per outcome; on reject it freezes the round into `rounds/{n}` and clears both inspector and customer sign-offs. Four rules gaps closed first (see §5). Admin granted approver rights to match `roles.ts`. 75 tests at this point. **The MVP loop is complete here.** |
| **Rebrand and mobile audit** | 2026-08-08 | `4b20cfc` | Renamed SolarOps→SolarQC in the user-facing places (title, `package.json` name, manifest, header, login/signup, template export filename). Device-width audit; fixed the 8-item admin bottom nav, which now scrolls. Virtual-keyboard behaviour with the sticky footer and `capture="environment"` on real iOS/Android were flagged as **not verified** by the commit. |
| **7 — Offline hardening** | 2026-08-08 | `4737198` | New IndexedDB queue (`offlinePhotoQueue.ts`) and replay (`offlineQueueReplay.ts`) for photo/signature uploads. Queue items are deleted **only** on confirmed upload, never after N failures (fixes plan defect §11.2). "Pending sync" thumbnails; `hasPendingWrites` surfaced so the UI shows "saved locally, syncing". Approver signatures are deliberately not queued. Also fixed two bugs that made the app unusable offline: **service worker precache glob excluded all JavaScript** (a blank page on offline reload), and **`useAuth.ts` force-refreshed the ID token** on every auth resolution (needs network). |
| **8 — Certificate, Excel, dashboards** | 2026-08-10 | `7f27627` | `generateQcReport.ts` (PDF certificate with embedded Noto Sans so Ω etc. render). `generateCertificate` = render → upload → write → event, in one batch; Cloudinary path `ritesolar-qc/{qcNum}/report`. `qcJobsExcel.ts` job-level Excel export (one row per job). `ReportsPage` and per-role `DashboardPage` counts via `getCountFromServer` (`useQcStatusCounts.ts`). Rules: `reportUrl`/`reportedAt` moved out of `managerFields()` into a dedicated `reportFields()` rule gated on `status == 'approved'`. 83 tests at this point. |

### 4.2 After Phase 8 (2026-08-10 → 08-19)

| Date | Commit(s) | Change | Why / notes |
|---|---|---|---|
| 08-10 | `414bfb1` | **Checklist 54 → 29 points.** Sections 5, 6, 7 removed; 1.10, 2.6, 2.7, 4.10 removed; section 3 restructured with new fieldIds (`qc_3_dcdb_acdb`, `qc_3_isolators`) for the two merged items; template version 1 → 2 | Updated QA spreadsheet. Fresh fieldIds because the old codes 3.3 and 3.6 meant something else on jobs already created. Pushed to live data through the Template Editor's own Import + Save, not by editing Firestore; this commit catches the repo up. |
| 08-10 | `fa4d285` | **Go-live: `errorLogs` rule fix** | `errorLogs` had no rule since Phase 0, so every write and every admin read was silently denied and the page always said "No errors logged yet". Found by deliberately triggering a real error during go-live verification. 89 tests. |
| 08-10 | `b1847c6` | Switched to SolarQC's own Google Analytics property in `index.html` | It was still using the sales app's property. |
| 08-10 | `41cb96d` | `docs/PILOT_BRIEFING.md` | Short briefing for the first pilot users. |
| 08-10 | `9378f6c` | **Rite Solar logo, favicon/PWA icons, new tagline** ("Quality Check Assured Performance.") | Logo assets in `public/logo/`; icons regenerated from the mark by `generate-icons`. Login logo sits on a white card because the wordmark is dark. |
| 08-10 | `8c988e0` | **Customer location.** Optional `customer.location {lat,lng}`; CSV `lat`/`lng` columns (range-validated); tap-to-call and Google Maps directions on job cards and the fill screen header (`directionsUrl.ts`) | Pilot feedback on a live job. Falls back to an address text search when no coordinates exist. No rules change was needed. |
| 08-11 | `348ae2b` | **DCR panel serial + nameplate capture, corrected** from the admin's customer form to the **inspector's fill screen** (`DcrPanelSection.tsx`). **`photo_only` activated** as checklist item 1.12 "Panel back view (scratch check)" | The admin never sees the panels; the inspector does. Panel data has its own narrow rules block (assigned/in_progress only, not rework) and its own offline-queue kind. Activating `photo_only` exposed two latent bugs, fixed here: validation could never treat it as answered (would have blocked submit forever), and the render branch gated on the wrong flag and issue code. Tally/certificate handling made explicit. |
| 08-12 | `c317e57` | **Security: self-signup privilege-escalation fix** | Self-create on `users/{uid}` had no content check, so any new signup could write `role:'admin', active:true` and no one could delete the doc client-side. Now pinned to `role:'qc_inspector', active:false` with an explicit `hasAll(['role','active'])`. |
| 08-13 | `76b98e8` | **Certificate font-subsetting fix.** **Shared read-only job view:** `JobReadOnlyView`, new route `/jobs/:id` (`JobDetailPage`) for admin/qc_manager/viewer; approver now sees DCR panel serials and photos | pdf-lib's `subset:true` corrupted glyphs across many short strings. Root-caused with an isolated repro in two PDF renderers; fix is `subset:false`. |
| 08-13 | `759f870` | **Jobs tab counts; searchable Customers directory** | Counts via `getCountFromServer`. `CountCard` and `useJobSearch` extracted so nothing is duplicated. Viewer gets the directory read-only. |
| 08-13 | `a98161e` | **Logout fix** | Two causes: `database.rules.json` (presence) had been committed in July but **never deployed**, and `handleLogout()` awaited the failing presence write before `signOut()`, so the button did nothing. Fixed by deploying the RTDB rules and making the presence write non-blocking with `.catch()`. Confirmed for all five roles per the commit message. |
| 08-13 | `3841acb` | **District/state on user create and edit** | Required for `qc_inspector`, optional for other roles. Form-and-wiring gap only; no rules change. |
| 08-14 | `6d266d3` | **`qc_manager` can create jobs.** `appConfig/global` allows `qc_manager` to write only `qcNumCounter`, `districts`, `districtsByState`; `qcJobs` create allowed for admin + qc_manager | A live permission-denied incident. Both rules were admin-only although `manageCustomers` gives `qc_manager` the UI. Deployed urgently during the incident; this commit catches the repo up. Also made the district config write awaited. The test suite **could not be run** here (no Java); assertions were reasoned through by hand. |
| 08-17 | `06ed5b2` | **`longtext` certificate fix** via `VERDICT_BEARING_TYPES` (`passfail`, `measurement` only) | A longtext field ("Inverter Serial no.") printed a meaningless "— [MAJOR]" tag. Fixed for all non-verdict types, not just longtext. Already deployed; commit catches the repo up. |
| 08-18 | `2f6463f` | **Panel photo enlarge**, including the fill screen | `DcrPanelSection` never declared `onPhotoClick`. The inspector's fill screen had no click-to-enlarge for any photo type; fixed by reusing `EvidenceGallery`. |
| 08-18 | `24bd2c7` | **Read-only visual language** | New `readOnly` prop on `QcCheckItem`, separate from `disabled`: badges and plain text instead of disabled-looking buttons and inputs. Only `JobReadOnlyView` sets it. An approver had reported reaching for a button that did nothing. |
| 08-19 | `7a47e28` | **Dashboard critical-fails tile routing + new composite index** | Tile now goes to `/customers?criticalFail=1`. `useQcJobs` got a `criticalFailOnly` option. Needed index `(updatedAt DESC, tally.criticalFail DESC)`; the first attempt with the fields in the other order failed live and was removed. |
| 08-19 | `d9b076f` | **Dashboard status tiles routed via `?status=`** | `JobsPage` hard-coded its initial tab to Unassigned and never read the URL, so every tile landed there. Now seeded from `?status=`; survives a hard reload. |

### 4.3 State of the two items you asked to be checked specifically

| Item | Finding |
|---|---|
| **Service worker `Cache.put()` error fix** | **Not committed, and not present in the code.** No commit mentions it. `vite.config.ts` was last changed in `4737198` (Phase 7, precache glob). It still has `runtimeCaching` entries for `firestore.googleapis.com` and `securetoken.googleapis.com` with `NetworkFirst` and `cacheableResponse: { statuses: [0, 200] }`. Whether the error is actually reproduced by those entries is **not established here**. Treat the fix as not done. |
| **Full checklist-detail Excel export** | **Not committed, and not present in the code.** The only job export is `qcJobsExcel.ts`: one sheet (`QC Jobs`), one row per job, with job-level columns only (status, verdict, tally counts, report URL, and so on), no per-checkpoint answers. Phase 8's commit message says it deliberately did not build the per-field-column shape. |

---

## 5. Architecture and key decisions

These are deliberate. Please read the reasoning before changing any of them.

**Version-locked templates per job.** `createQcJob` snapshots `appConfig/global.qcTemplate` and `qcTemplateVersion` onto the job in the same transaction that reserves the `qcNum`. Editing the template (including the 54→29 revision) affects new jobs only. An in-flight inspection can never change shape under the inspector, and a certificate always reflects the checklist the job was done against.

**Critical fails are advisory and never block.** The app counts Pass/Fail/N/A and critical/major/minor fails, and shows a *suggested* verdict (any critical fail → reject, any fail → conditional, otherwise pass). That suggestion gates nothing. Submission is blocked only by validation issues (unanswered required point, missing mandatory photo, missing remark or photo on a Fail, missing signature, incomplete DCR panel data). Critical fails raise a confirmation dialog. (Change-plan decisions #2 and #3.)

**The approver's verdict is typed.** The rules require a non-empty `verdictNote` on every decision, non-empty `conditions` for a conditional verdict, and for a reject a non-empty `rejectionReason`, a non-empty `reworkPointIds` list, and `reworkRound` advanced by exactly one. No silent approvals, no reason-less rejections. Admin may also act as approver.

**No denormalised counters.** The plan proposed live counters on `appConfig/global`. They were dropped in favour of `getCountFromServer` (`useQcStatusCounts.ts`). The sales app's counters were a write hotspot on one document (about one write per second) and a source of drift bugs, and QC volume is tens of jobs a day. `appConfig/global` still holds `qcNumCounter` and `inspectorNumCounter`.

**Client-side only, no Cloud Functions.** The project stays on the free tier and avoids server code. The cost: no push notifications, no custom auth claims (roles come from reading `users/{uid}` in the rules), and the certificate is generated in the browser (so it is client-forgeable; see §12 Q4).

**Field-scoped Firestore rules using `hasOnly()`.** Each actor has an allow-listed set of writable fields: inspector, panel data, approver, admin/qc_manager (assignment and lifecycle only), certificate generation. `touched().hasOnly(...)` makes any write outside the set fail. Several of these were tightened during the build after finding real gaps (for example: admin/qc_manager could previously set `status: 'approved'` directly; fixed in Phase 3). Each rule was added for a reason that is recorded in its comment. **Do not widen a field list to make a UI easier.**

**Offline queue deletes only on confirmed upload.** `offlinePhotoQueue.ts` stores blobs in IndexedDB. The replay processor removes an item only in its success branch. A failed attempt records the error and keeps the item. Only connectivity failures are queued; other Cloudinary errors surface as real errors because queueing them would hide a configuration bug. No `data:` URL is ever written to Firestore. Ordinary Firestore field writes rely on the SDK's persistent cache.

**Other rules worth knowing:**

- `events` subcollection: append-only for everyone, including admin (`update, delete: if false`), and the creator must be the actor.
- `rounds/{n}`: written once, by approver/admin, on reject. Keeps round-1 evidence while round 2 is filled.
- Inspector reads are always filtered by `inspectorUid` in the query. An unfiltered query that could match even one other job fails outright with permission-denied. It does not narrow silently.
- On reject, both inspector and customer sign-offs are nulled so round 2 needs fresh attestation. The rules allow an approver to set them only to `null`.
- Certificate (`reportFields()`): admin/qc_manager only, only when `status == 'approved'`, `reportUrl` a non-empty string. Deliberately narrower than `viewReports`, which includes viewer.
- `users/{uid}` self-create is pinned to `qc_inspector` / `active:false`. The invite-based signup flow (`/signup/:inviteId`) is **not working for any role** under these rules. See §10.

**Deploy targets are independent.** See §9.

---

## 6. Roles and permissions

From `src/config/roles.ts`. `can(role, capability)` is the only permission check the UI uses; routes are guarded in `src/App.tsx`.

| Role | Label | Default route | Capabilities | Nav |
|---|---|---|---|---|
| `admin` | Admin | `/dashboard` | manageUsers, manageTemplate, manageCustomers, assignJobs, approveJobs, viewAllJobs, viewReports, viewPresence | Home, Jobs, Customers, Approvals, Team, Template, Reports, Error Logs |
| `qc_manager` | QC Manager | `/dashboard` | manageCustomers, assignJobs, viewAllJobs, viewReports, viewPresence | Home, Jobs, Customers, Reports |
| `qc_inspector` | QC Inspector | `/my-jobs` | fillChecklist | Home, My Jobs |
| `approver` | Approver | `/approvals` | approveJobs, viewAllJobs | Home, Approvals |
| `viewer` | Viewer | `/dashboard` | viewAllJobs, viewReports | Home, Jobs, Customers, Reports |

**Routes** (`src/App.tsx`):

| Route | Allowed roles |
|---|---|
| `/dashboard` | any signed-in role |
| `/jobs`, `/jobs/:id`, `/customers` | admin, qc_manager, viewer |
| `/my-jobs`, `/jobs/:id/fill` | qc_inspector |
| `/approvals`, `/approvals/:id` | approver, admin |
| `/reports` | admin, qc_manager, viewer |
| `/team`, `/template`, `/error-logs` | admin |
| `/login`, `/signup/:inviteId` | public |

**Actions beyond what `roles.ts` capabilities show** (enforced by `firestore.rules`):

- Creating and generating a certificate are admin/qc_manager only (viewer cannot write anywhere).
- Job creation: admin and qc_manager. Job deletion: admin only.
- Assigning or unassigning (`unassigned` ↔ `assigned`): admin and qc_manager.
- Role separation: the plan says one account must not hold both inspector and approver. Because a user has exactly one `role` field, this holds by construction.

The change plan also lists a role-specific scoping question for approvers (§12 Q2).

---

## 7. Data model

### Collections

| Path | Purpose | Notes |
|---|---|---|
| `qcJobs/{id}` | The QC job: customer, system, assignment, template snapshot, answers, tally, sign-offs, verdict fields, report URL | Types in `src/types/qc.ts` |
| `qcJobs/{id}/events/{autoId}` | Audit trail | Append-only. Event types used by code: `submitted`, `rejected`, `report_generated` and others. See the caveat below. |
| `qcJobs/{id}/rounds/{n}` | Frozen copy of a rejected round (answers, tally, template, sign-offs) | Write-once |
| `appConfig/global` | Template and counters (below) | Read: any signed-in user. Write: admin; qc_manager limited to three fields |
| `users/{uid}` | Profile, role, `active`, district/state, employee code | Read: self, admin, qc_manager |
| `invites/{id}` | Signup invites | **No rule exists** → all access denied (§10) |
| `errorLogs/{id}` | Client error log | Create: self-reported; read: admin only; no update/delete |
| `tasks/{id}` | Sales-app leftover | **No rule exists**, so it is inaccessible. Some dead code still references it (§10). |
| Realtime Database `/presence` | Who is online | `auth != null` for read and write |

Event types the type allows: created, assigned, unassigned, started, draft_saved, submitted, approved, approved_conditional, rejected, reopened, cancelled, template_changed, report_generated. The commits show writes for `submitted`, `rejected` and `report_generated`; I did not audit the others and don't claim every type is written.

### `appConfig/global` fields in use

`qcTemplate` (array), `qcTemplateVersion` (currently seeded as `2`; live value may be higher because later template pushes bump it), `qcNumCounter`, `inspectorNumCounter`, `severityDefaults`, `declarationTexts`, `districts`, `districtsByState`, `superAdminUid`, `orgName` and related inherited fields. The plan's `inspectorCounts` / `approverCounts` / `qcCounts` / `criticalFailOpen` were deliberately **not** added (§5).

### Job status lifecycle

`QcStatus` = `unassigned | assigned | in_progress | pending_approval | approved | rework | cancelled`.

| Status | Set by | Next |
|---|---|---|
| `unassigned` | creation | `assigned` |
| `assigned` | admin/qc_manager | `in_progress`, or back to `unassigned` |
| `in_progress` | inspector's first save | `pending_approval` |
| `pending_approval` | inspector submit | `approved` or `rework` |
| `rework` | approver reject (`reworkRound` += 1) | inspector resumes, then `pending_approval` |
| `approved` | approver | terminal (certificate can be generated) |
| `cancelled` | — | **No UI and no rule path sets it.** `cancelQcJob` exists in code but is not wired up and the rules deliberately do not allow admin/qc_manager to write it. Rules only allow `unassigned`/`assigned` through the manager path. |

### Firestore indexes

`firestore.indexes.json` has 12 `qcJobs` composite indexes (the 11 from Phase 1 plus `(updatedAt DESC, tally.criticalFail DESC)` from `7a47e28`). It also still contains about 48 composite indexes on the old `tasks` collection. They are unused and can be removed (§10).

---

## 8. Checklist template system

**How it's edited.** Admin → Template → QC Checklist (`TemplateEditor.tsx`). It supports every attribute: severity, photo min/max, `allowNA`, remark/photo on fail, measurement bounds and unit, `showIf`, select options, reorder within and across sections, delete with confirmation. Edits are saved explicitly, not per keystroke. Checklists can also be exported to and imported from Excel (`qcTemplateExcel.ts`); import validates every row first and rejects the whole file on any error. A valid file loads into the editor for review, and only commits on Save.

**How it's versioned.** `saveQcTemplate` writes `qcTemplate` and bumps `qcTemplateVersion`. Jobs snapshot their own copy at creation, so edits only affect **new** jobs. `initQcConfig()` only seeds a template if none exists. It never overwrites a live one, so pushing a revised template to a live project means doing it through Template → Import → Save.

**Current content.** `src/firebase/qcTemplateSeed.ts` (`QC_TEMPLATE_VERSION = 2`) defines **4 sections and 30 check points**: 29 pass/fail-or-measurement points plus 1.12, the `photo_only` item.

| § | Section | Points |
|---|---|---:|
| 1 | Structural & Mounting Integrity | 11 (1.1–1.9, 1.11, 1.12) |
| 2 | Electrical & Cable Management | 5 |
| 3 | Earthing (Grounding) & Safety Devices | 5 (codes 3.1, 3.3, 3.4, 3.5, 3.6) |
| 4 | Inverter & Commissioning Checks | 9 |
| | **Total** | **30** |

Per the seed's own header: 14 Critical, 13 Major, 2 Minor, 1 with no verdict (1.12), 13 requiring a photo even to pass, and 1 `measurement` field (4.3 Production check, unit `%`, expected 70–80). The live template may differ from the seed: an admin can edit it, and the "Inverter Serial no." longtext field mentioned in `06ed5b2` is **not in the seed**, so it exists only in live data. The live template can't be read from the repo.

**Field types and real support status** (verified from `qcTally.ts`, `qcValidation.ts`, `QcCheckItem.tsx`, `generateQcReport.ts`; "tested" means a test file covers it):

| Type | Renders on fill screen | Counted in tally | Validation | On certificate | Notes |
|---|---|---|---|---|---|
| `passfail` | Yes (full) | Yes (pass/fail/na, severity) | Yes (required, photo, remark/photo on fail) | Yes (status tag + severity) | The workhorse |
| `measurement` | Yes (`MeasurementInput`, range check) | Yes (answered by value or status) | Yes | Yes (verdict-bearing) | Only 4.3 uses it in the seed |
| `photo_only` | Yes | Counts toward total/answered once `minPhotos` met; excluded from pass/fail/na and suggested verdict | Yes, by photo count when `isRequired` | "Documented (N photos)" | Activated in `348ae2b` |
| `longtext`, `text`, `number`, `date`, `select` | Basic rendering | Counts as answered if a value is present | `isRequired` check | Value printed, no verdict tag (after `06ed5b2`) | Exists in template editor; not used in the seed. `longtext` was used live. Other non-verdict types share the fix but weren't individually exercised in commits. |
| `section_header` | Section title | Excluded | Skipped | Section heading | Structural |
| **`signature`** | **Placeholder only** | — | None | Referenced in a comment as "once implemented" | **Selectable in the Template Editor but not implemented.** The fill screen shows "Signature capture is coming in a later update." Real signatures are separate: the inspector/customer/approver sign-offs, not a template field. |

`showIf` conditional visibility is implemented (`isFieldVisible`) and editable, but **no template item uses it**.

---

## 9. Deployment

Each target is deployed **separately**. One `firebase deploy` with no `--only` can hide a partial failure, and several incidents in this project's history came from a target not being deployed (the RTDB rules in `a98161e`; the rules/indexes bundled deploy failing in `4794781`). Run from the repo root, with the `solarqc` project active. **These are listed for reference only; nothing was run to produce this document.**

| Target | Command | Deploys |
|---|---|---|
| Hosting | `npm run build` then `firebase deploy --only hosting` | `dist/` (the SPA, service worker, manifest). `firebase.json` sets `no-cache` on `/sw.js`, `/index.html`, `/manifest.json`, long-lived immutable caching on hashed JS/CSS, and an SPA rewrite to `/index.html`. |
| Firestore rules | `firebase deploy --only firestore:rules` | `firestore.rules` |
| Firestore indexes | `firebase deploy --only firestore:indexes` | `firestore.indexes.json` (indexes take time to build; queries using a new index fail until it is ready) |
| Realtime Database rules | `firebase deploy --only database` | `database.rules.json` (presence). Without it, sign-out and presence break. |

Hosting is configured in `firebase.json` (inherited from the original commit). No commit in this branch is labelled "Hosting setup", so the actual go-live deploy was done outside git. **Rules and index changes in this history were frequently deployed before the repo commit** (`6d266d3`, `06ed5b2`, `7a47e28` and others say so). Do not assume the repo and the live project agree.

Local emulators: `firebase.json` defines Auth `:9099`, Firestore `:8080`, Hosting `:5000`, UI `:4000`. Set `VITE_USE_EMULATORS=true` in `.env.local` to use them.

---

## 10. Known issues and limitations

- **Invite signup does not work.** `/signup/:inviteId` reads `invites/{id}` before auth, but `invites` has no rules, so access is denied. Self-create is also pinned to `qc_inspector` / `active:false`. Users are created by an admin in `/team`. (Documented in the rules file itself.)
- **Customer-name characters outside Latin script** render as `?` on the PDF certificate (known; in the pilot briefing).
- **Approvers cannot sign offline.** The verdict batch needs connectivity; approver signatures are deliberately not queued (pilot briefing; `4737198`).
- **Drawn signature is an audit trail, not a legal digital signature.** There is no DSC, e-sign or IT Act integration.
- **No edit after creation** for a job's customer or system details (stated in `8c988e0`).
- **Existing jobs have no customer coordinates** and use the address-search fallback for directions.
- **Cancel is not possible.** `cancelled` exists in the type and status labels but nothing can set it (see §7).
- **Cloudinary uploads are unsigned**, so the cloud name and preset are in the client bundle and anyone with them can upload (plan §11). Photos carry no burned-in watermark and lose EXIF GPS through compression.
- **Certificate is generated in the browser**, so it is client-forgeable by anyone with `qc_manager` rights.
- **Dead code and leftovers from SolarOps:** `src/utils/exportTasksToExcel.ts` (no imports), `src/types` entries, `tasks` references in some hooks, ~48 unused `tasks` indexes in `firestore.indexes.json`, `prod-current-indexes.json` (old sales project export).
- **Template snapshot per job means** a check point removed from the live template remains on older jobs. This is intended.
- **Tests are partly unverified.** See §11.

---

## 11. Pending / required next

Each item below was checked against the current code unless noted.

**Deliberately deferred (Phase 9):**

- Push notifications and custom auth claims. Both need Cloud Functions and the Blaze plan. `fcmToken` fields exist on the user record, but nothing sends.
- Per-inspector scorecards. Also from the Phase 9 list: rework-round diff view, installer/crew ranking, server-side PDF generation.

**Required for confidence in rules:**

- **Install a JDK on the development machine and run `npm run test:rules`.** The test file has 96 `it(...)` cases and Phase 8–era commits report 83–89 passing, but several later rules changes (`c317e57` self-signup fix, `6d266d3` qc_manager scope, panel rules in `348ae2b` partly) were verified only by live deployment and hand-reasoned assertions. `6d266d3` states the suite could not be run. The suite has not been run as part of this documentation task.

**Open defects:**

- **Service worker `Cache.put()` error:** not fixed in the repo (§4.3).
- **`signature` field type** is selectable in the Template Editor but not implemented (§8). Either implement it or remove it from the editor's type list.
- **No edit-after-creation** for job/customer details, and **no save-as-draft for large DCR jobs** (the second is from your notes; there is no code or commit that addresses it, and I did not test whether large panel counts are a problem).
- **Inspector's own view of a submitted job** may still use the old interactive-looking styling. `readOnly` is only set from `JobReadOnlyView`; the inspector's `QcFillPage` after submission uses `disabled` only (`24bd2c7` states this was deliberate). This matches the code, but whether it still bothers users is a product call.
- **Approvers cannot sign offline** (limitation above).
- **Non-Latin names render as `?`** on the certificate.
- **Full checklist-detail Excel export** is not built (§4.3).
- **Legal e-signature** is separate future work.

**Manual cleanups (cannot be done from the repo):**

- Cloudinary files belonging to deleted jobs are not removed automatically.
- Orphaned `users/{uid}` Firestore docs from test accounts remain, because `users` delete is `false` for everyone including admin, and the Auth account is separate from the doc. These need console-side cleanup.

**Data quality:**

- **4.3 Production check** has a measurement field that is reported as not being filled with real values. This comes from your notes. **It can't be verified from git or code**, which only define the field (unit `%`, 70–80). It is a live-data observation.

**Template housekeeping:**

- Section 3 numbering skips 3.2 (codes 3.1, 3.3, 3.4, 3.5, 3.6): verified in the seed. It is a cosmetic consequence of `414bfb1` and the live template may differ.

**Code housekeeping:**

- Delete dead `exportTasksToExcel.ts`.
- No ESLint config exists, so `npm run lint` fails.
- `approverUid` / `approverName` on `QcJob` are set to `null` / `''` at creation (`useQcJobActions.ts`) and nothing assigns an approver, so they are unused.

---

## 12. Open business questions

From `docs/QC_APP_CHANGE_PLAN.md` §12, unresolved in this repo. No commit records an answer.

1. **One QC visit or two?** Documentation/handover and fault-time testing suggested commissioning and handover QC are different events (should there be two job types with different templates?). Sections 5–7 were later removed, which may have overtaken this question. Confirm.
2. **Who is the approver in practice,** a central QC head or a regional approver per state/district? If regional, `approverUid` needs assignment rules and the approvals queue needs scoping. Today any approver sees every pending job.
3. **Does the customer sign in the app** (on the inspector's phone) or on paper that is photographed? The app supports the optional in-app signature.
4. **Is the PDF certificate given to the customer or to DISCOM?** If it leaves the company, it should be generated server-side so it can't be forged.
5. **Does QC feed back into installer payment?** If installer retention depends on QC pass, approval becomes a financial control and audit requirements tighten.
6. **Rework SLA?** Should a `rework` job carry a target date and escalate when breached?
7. **Sales data source.** Is manual CSV upload the long-term answer, or will this read from the sales app / ERP? `customer` and `system` are kept as clean nested blocks so an API could populate them.

---

## 13. Uncommitted at time of writing

`git status --short` showed one change before this document was created: **`M tsconfig.app.tsbuildinfo`**. This is a TypeScript build cache that `tsc -b` rewrites on every build. It is not work product and was not touched by this task. Nothing else was uncommitted. There are no stashes.

---

## 14. Items from your list not found or only partly found in git

See the note at the end of §4.3. In short:

- **Service worker `Cache.put()` fix** — no evidence in git or code.
- **Full checklist-detail Excel export** — no evidence in git or code.
- **"Go-live: Firebase Hosting setup"** — `firebase.json` hosting config dates from the initial commit; no commit sets up hosting for `solarqc`. Only the `errorLogs` fix (`fa4d285`), the GA property (`b1847c6`) and the pilot briefing (`41cb96d`) are labelled go-live work.
- **4.3 data-quality note, "no save-as-draft for large DCR jobs", Cloudinary and orphan-user cleanups** — operational observations with no code or commit to check.
