import type { UserRole } from '@/config/roles';

// ── Status machine ──────────────────────────────────────────────────────
export type QcStatus =
  | 'unassigned' | 'assigned' | 'in_progress'
  | 'pending_approval' | 'approved' | 'rework' | 'cancelled';

export type QcVerdict   = 'pass' | 'conditional' | 'reject';   // approver-typed
export type Severity    = 'critical' | 'major' | 'minor';
export type CheckStatus = 'pass' | 'fail' | 'na' | null;       // null = unanswered

// ── The check-point definition (matches qcTemplateSeed.ts exactly) ──────
export type QcFieldType =
  | 'passfail'          // Pass / Fail / N/A + remark + photos
  | 'measurement'       // numeric + unit + expected range
  | 'number' | 'text' | 'longtext' | 'select' | 'date'
  | 'photo_only'
  | 'signature'
  | 'section_header';

export interface QcFieldDefinition {
  fieldId:     string;
  code?:       string;
  label:       string;
  type:        QcFieldType;
  sortOrder:   number;

  verifyText?:  string;
  target?:      string;
  method?:      string;
  severity?:    Severity;

  photoRequired?:  boolean;
  minPhotos?:      number;
  maxPhotos?:      number;

  allowNA?:              boolean;
  remarkRequiredOnFail?: boolean;
  photoRequiredOnFail?:  boolean;

  expectedMin?: number;
  expectedMax?: number;
  unit?:        string;

  showIf?: { fieldId: string; equals: string };
  isRequired: boolean;
  options:    string[];
}

// ── The answer ────────────────────────────────────────────────────────
export interface QcAnswer {
  fieldId:       string;
  code?:         string;
  status:        CheckStatus;
  value?:        string;
  numericValue?: number;
  inRange?:      boolean;
  remark:        string;
  photoUrls:     string[];
  answeredAt:    Date | null;
  answeredBy:    string;
  round:         number;
}

// ── Sign-off ──────────────────────────────────────────────────────────
export interface SignOff {
  role:          'inspector' | 'customer' | 'approver';
  name:          string;
  designation?:  string;
  uid:           string | null;   // null for the customer
  signatureUrl:  string;
  signedAt:      Date;
  location:      { lat: number; lng: number; accuracy: number } | null;
  deviceInfo:    string;
  declaration:   string;
}

// ── The job itself ────────────────────────────────────────────────────
export interface QcJob {
  id:            string;
  qcNum:         string;         // 'QC-000123' — 6-digit pad (fixes §11.3)
  status:        QcStatus;
  reworkRound:   number;

  customer: {
    name:          string;
    nameLower:     string;
    nameWords:     string[];
    mobile:        string;
    altMobile?:    string;
    address:       string;
    district:      string;
    state:         string;
    pincode?:      string;
    salesRef?:     string;
    location?:     { lat: number; lng: number };
  };

  system: {
    sizeKw:            number;
    moduleMake?:       string;
    moduleWattage?:    number;
    moduleCount?:      number;
    inverterMake?:     string;
    inverterModel?:    string;
    inverterSerial?:   string;
    installationDate?: string;
    installerCrew?:    string;
    systemType?:       'ongrid' | 'hybrid' | 'offgrid';
    moduleType?:       'dcr' | 'non_dcr';
    // DCR compliance only — one entry per panel, each backed by a photo
    // of that panel's nameplate. Length always equals moduleCount when
    // present; never populated for moduleType 'non_dcr'.
    panels?:           Array<{ serialNumber: string; photoUrl: string }>;
  };

  inspectorUid:    string | null;
  inspectorName:   string;
  inspectorCode:   string;
  inspectorMobile: string;
  approverUid:     string | null;
  approverName:    string;

  scheduledDate:  Date | null;
  dueDate:        Date | null;

  template:        QcFieldDefinition[];   // version-locked snapshot at creation
  templateVersion: number;
  answers:         Record<string, QcAnswer>;

  tally: {
    total:            number;
    answered:         number;
    pass:             number;
    fail:             number;
    na:               number;
    criticalFail:     number;
    majorFail:        number;
    minorFail:        number;
    suggestedVerdict: QcVerdict;   // ADVISORY ONLY — never gates anything
  };

  location:   { lat: number; lng: number; accuracy: number } | null;
  locationAt: Date | null;

  inspectorSignOff: SignOff | null;
  customerSignOff:  SignOff | null;
  approverSignOff:  SignOff | null;

  // Approver-only fields — the rules below make these unwritable by
  // anyone else. Never relax that to "make a UI easier."
  verdict:          QcVerdict | null;
  verdictNote:      string;
  conditions:       string;
  rejectionReason:  string;
  reworkPointIds:   string[];
  approverComments: Record<string, string>;

  submittedAt: Date | null;
  reviewedAt:  Date | null;
  completedAt: Date | null;

  reportUrl:  string | null;
  reportedAt: Date | null;

  createdBy:    string;
  createdAt:    Date;
  updatedAt:    Date;
  archived:     boolean;
  archivedAt:   Date | null;
  cancelReason: string | null;
}

// ── Audit trail — qcJobs/{id}/events/{autoId}. Append-only, immutable. ──
export interface QcEvent {
  id:        string;
  type: 'created' | 'assigned' | 'unassigned' | 'started' | 'draft_saved'
      | 'submitted' | 'approved' | 'approved_conditional' | 'rejected'
      | 'reopened' | 'cancelled' | 'template_changed' | 'report_generated';
  actorUid:  string;
  actorName: string;
  actorRole: UserRole;
  at:        Date;
  round:     number;
  note?:     string;
  snapshot?: {
    tally?:   QcJob['tally'];
    verdict?: QcVerdict | null;
    status?:  QcStatus;
  };
}

// ── qcJobs/{id}/rounds/{roundNumber} — a frozen copy of a completed round,
// written when the approver rejects. Keeps round 1's evidence intact while
// round 2 is filled, without the parent doc growing past 1 MiB (plan §3.5).
export type QcRound =
  Pick<QcJob, 'answers' | 'tally' | 'template' | 'templateVersion' | 'inspectorSignOff' | 'customerSignOff'>
  & { round: number; frozenAt: Date };
