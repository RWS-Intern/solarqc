# SolarQC

**Quality Check Assured Performance**

SolarQC is the post-installation quality-check app for Rite Solar rooftop
solar systems. A field inspector works through a standard checklist on a
phone, captures photo evidence and signs off. An approver reviews the
inspection and approves it or sends it back for rework. Approved jobs get a
signed PDF certificate.

- **Live app:** https://solarqc.web.app
- **Firebase project:** `solarqc`
- **Active branch:** `qc-conversion`

> ⚠️ **Production holds real customer data.** Never create test accounts,
> customers or jobs in production. Test against a local Firebase emulator
> seeded with copies of real data instead.

---

## Features

| Role | What they can do |
|---|---|
| **Admin** | Everything: create and assign jobs, manage the team, edit the QC checklist template, approve jobs, generate certificates, export data, view error logs |
| **QC Manager** | Create customers and jobs (single or CSV import), assign inspectors, view all jobs, generate certificates, export reports |
| **QC Inspector** | See own assigned jobs, call the customer or open directions, fill the checklist with photos, capture DCR panel serials, sign and submit — works offline |
| **Approver** | Review submitted jobs, approve, approve with conditions, or reject and send back for rework |
| **Viewer** | Read-only access to jobs, the customer directory and reports |

Other highlights:

- **Offline-first field use.** Answers save locally; photos and signatures
  queue in IndexedDB and upload automatically when signal returns.
- **Version-locked checklists.** Each job keeps the exact checklist it was
  created with, so later template edits never change past inspections.
- **DCR panel tracking.** Per-panel serial number and nameplate photo for
  DCR systems.
- **Reports.** PDF certificates, summary Excel export, per-role dashboards
  and a searchable customer directory.

---

## Tech stack

- React 18, TypeScript, Vite 6, Tailwind CSS
- Firebase: Firestore, Authentication, Realtime Database (presence), Hosting
- Cloudinary for photos, signatures and certificate PDFs
- pdf-lib (certificates, generated in the browser), SheetJS (Excel)
- Workbox service worker (PWA), `idb` for the offline queue
- Vitest for unit and security-rules tests, Playwright for verification

There is **no backend server and no Cloud Functions**. Everything runs in
the browser, which keeps the project on Firebase's free Spark plan.

---

## Getting started

### Prerequisites

- Node.js 18 or newer
- Firebase CLI (`npm install -g firebase-tools`)
- Java (JDK 11+) — only needed to run the Firestore emulator for rules tests

### Setup

```bash
git clone https://github.com/RWS-Intern/solarqc.git
cd solarqc
git checkout qc-conversion
npm install
```

Create a `.env.local` file in the project root with these variables. Never
commit it.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_URL=
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
VITE_USE_EMULATORS=false   # true = use local Auth/Firestore emulators
```

### Run locally

```bash
npm run dev
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run test:unit` | Unit tests for checklist tally and validation logic |
| `npm run test:rules` | Firestore security-rules tests (starts the emulator; needs Java) |
| `npm run generate-icons` | Regenerate the favicon and PWA icons from the logo mark |
| `npm run lint` | Not working yet: ESLint is not installed or configured |

---

## Deployment

Each Firebase target deploys **separately**. A rules change is not live
until that target is deployed, and code is not live until hosting is
deployed.

```bash
npm run build
firebase deploy --only hosting --project solarqc
firebase deploy --only firestore:rules --project solarqc
firebase deploy --only firestore:indexes --project solarqc
firebase deploy --only database --project solarqc   # Realtime Database rules
```

Before deploying:

1. Commit and push first, so GitHub always matches what is live.
2. Deploy from the `qc-conversion` branch.
3. After deploying, open a real job on the live site and check it yourself.
   A successful deploy log is not proof that the change works.

---

## Project structure

```
src/
  config/        roles.ts (roles & capabilities), qcStatus.ts (job statuses)
  firebase/      Firebase config, default checklist template (qcTemplateSeed.ts)
  utils/         tally, validation, PDF certificate, Cloudinary upload, offline queue
  hooks/         job queries, search, job actions, presence
  components/qc/ checklist items, photo capture, DCR panels, read-only job view
  pages/         one file per screen
tests/           unit tests and Firestore rules tests
docs/            plan, project history, pilot briefing
firestore.rules, firestore.indexes.json, database.rules.json
```

---

## Key design decisions

Read these before changing anything structural.

- **Checklist templates are version-locked per job.** Editing the template
  affects new jobs only.
- **Critical fails do not block submission.** Severity guides the approver,
  who types the final verdict.
- **Counts are computed on demand** with `getCountFromServer`. There are no
  stored counter fields that can drift.
- **Security rules grant specific fields, not whole documents**, using
  `hasOnly()`. Follow this pattern for any new permission.
- **The offline queue deletes an upload only after it is confirmed.** Never
  after a failure or a retry limit.

---

## Verification practices

- A green signal means "accepted", not "correct". Rules that compile,
  indexes marked READY, and successful deploys must still be checked by
  running the real query or write.
- Check PDF certificates by viewing the rendered pages, not by extracting
  their text.
- After a write, read the stored document back to confirm it saved.

---

## Documentation

- `docs/QC_APP_CHANGE_PLAN.md` — original specification and phase plan
- `docs/SOLARQC_PROJECT_HISTORY.md` — full record of changes, known issues
  and pending work
- `docs/PILOT_BRIEFING.md` — limitations briefing for pilot users

---

## Known limitations

- Approvers cannot sign while offline.
- Customer names in non-Latin scripts render as `?` on PDF certificates.
- Job and customer details cannot be edited after the job is created.
- Invite links (`/signup/:inviteId`) don't work. Add users from the Team page.
- Jobs cannot be cancelled from the app yet.
- The `signature` checklist field type is not implemented yet. Don't use it
  in the template.
- The drawn sign-off is an internal audit trail, not a legally valid
  digital signature.
- Deleting a job does not remove its files from Cloudinary.

See `docs/SOLARQC_PROJECT_HISTORY.md` for the full list and pending work.

---

© Rite Water Solutions (India) Limited — Rite Solar. Internal software, not
for external distribution.
