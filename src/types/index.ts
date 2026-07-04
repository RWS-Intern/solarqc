// ─── Auth / Users ──────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'field' | 'proposal' | 'backend' | 'logistics' | 'installation';

export interface User {
  id:                string;
  name:              string;
  email:             string;
  role:              UserRole;
  active:            boolean;
  engineerCode?:     string;
  createdAt:         Date;
  createdBy?:        string;
  deletedAt?:        Date | null;
  photoURL?:         string;
  district?:         string;
  fcmToken?:         string;
  fcmTokenUpdatedAt?: Date;
}

export interface AppUser {
  uid:               string;
  name:              string;
  email:             string;
  role:              UserRole;
  active:            boolean;
  engineerCode?:     string;
  createdAt:         Date;
  createdBy?:        string;
  deletedAt?:        Date | null;
  photoURL?:         string;
  district?:         string;
}

// ─── Task Form Template ────────────────────────────────────────────────────────

export type FieldType =
  | 'yesno' | 'text' | 'number' | 'select' | 'photo_only' | 'date'
  | 'measurement' | 'age' | 'section_header';

// ─── Application Journey ───────────────────────────────────────────────────────

export type JourneyStepType = 'yesno' | 'photo';

export interface JourneyStepDefinition {
  stepId:    string;
  label:     string;
  type:      JourneyStepType;
  sortOrder: number;
}

export interface JourneyStepAnswer {
  stepId:     string;
  label:      string;
  type:       JourneyStepType;
  status:     'pending' | 'done';
  realDate:   string | null;
  photoUrls:  string[];
  inputValue?: string;
  recordedAt: Date | null;
  recordedBy: string;
}

export interface FieldDefinition {
  fieldId:    string;
  label:      string;
  type:       FieldType;
  isRequired: boolean;
  options:    string[];
  sortOrder:  number;
  unit?:      string;
}

// ─── AppConfig ─────────────────────────────────────────────────────────────────

export interface AppConfig {
  orgName:                 string;
  taskNumCounter:          number;
  engineerNumCounter:      number;
  proposalNumCounter?:     number;
  backendNumCounter?:      number;
  taskTemplate:                FieldDefinition[];
  documentTemplate?:           FieldDefinition[];
  backendChecklistTemplate?:   FieldDefinition[];
  backendCashSteps?:           JourneyStepDefinition[];
  backendLoanSteps?:           JourneyStepDefinition[];
  superAdminUid?:              string;
  pipelineCounts?: {
    survey:              number;
    proposal:            number;
    field_review:        number;
    documents:           number;
    backend:             number;
    completed:           number;
    dropped:             number;
    unassigned_proposal: number;
    unassigned_backend:  number;
    total_active:        number;
  };
  memberCounts?: Record<string, number>;
  districts?:    string[];
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export type PipelineStage =
  | 'survey'
  | 'proposal'
  | 'field_review'
  | 'documents'
  | 'backend'
  | 'completed'
  | 'dropped';

export interface StageHistoryEntry {
  toStage:    PipelineStage;
  fromStage?: PipelineStage;
  timestamp:  Date;
  actorName:  string;
  actorRole:  string;
  note?:      string;
}

export interface SurveyStageData {
  fieldAnswers?:       Record<string, { value: string; type: FieldType }>;
  fieldPhotos?:        Record<string, string[]>;
  location?:           { lat: number; lng: number } | null;
  submittedAt?:        Date;
  submittedBy?:        string;
  surveyFormSnapshot?: FieldDefinition[];
}

export interface ProposalDocument {
  url:  string;
  name: string;
}

export interface ProposalRevision {
  documentUrl:    string;
  documentName:   string;
  uploadedAt:     Date;
  uploadedBy:     string;
  uploadedByName: string;
  revisionNote:   string;
  documents?:     ProposalDocument[];
}

export interface ProposalStageData {
  documentUrl?:    string;
  documentName?:   string;
  uploadedAt?:     Date;
  uploadedBy?:     string;
  uploadedByName?: string;
  revisions:       ProposalRevision[];
  documents?:      ProposalDocument[];
}

export interface FieldReviewStageData {
  reviewDate?:   string;
  reviewerName?: string;
  approved?:     boolean;
  notes?:        string;
}

export interface DocumentsStageData {
  documentAnswers?: Record<string, string>;
  documentPhotos?:  Record<string, string[]>;
  submittedAt?:     Date;
  submittedByUid?:  string;
  submittedByName?: string;
}

export interface BackendStageData {
  subsidyApplied?:    boolean;
  subsidyStatus?:     string;
  portalRegDate?:     string;
  sanctionLetterUrl?: string;
  notes?:             string;
}

export interface LogisticsStageData {
  expectedDelivery?: string;
  actualDelivery?:   string;
  panelCount?:       number;
  inverterModel?:    string;
  notes?:            string;
}

export interface InstallationStageData {
  installDate?:      string;
  commissionDate?:   string;
  netMeterApplied?:  boolean;
  netMeterApproved?: boolean;
  notes?:            string;
}

// ─── Task ──────────────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface Task {
  id:               string;
  taskNum:          string;
  title:            string;
  titleLower?:      string;
  description?:     string;
  district?:        string;
  assignedTo:       string | null;
  assignedToName:   string;
  assignedToCode:   string;
  status:           TaskStatus;
  dueDate:          Date | null;
  followUpDate:     Date | null;
  fields:           FieldDefinition[];
  fieldAnswers:     Record<string, { value: string; type: FieldType }>;
  fieldPhotos:      Record<string, string[]>;
  completionPhotos: string[];
  blockedReason:    string | null;
  location:         { lat: number; lng: number; accuracy?: number } | null;
  submittedBy:      string | null;
  submittedAt:      Date | null;
  createdBy:        string;
  createdAt:        Date;
  updatedAt:        Date;
  archived:         boolean;
  archivedAt?:      Date | null;
  // Pipeline fields (optional — populated by migratePipelineStages on first run)
  pipelineStage?:         PipelineStage;
  stageHistory?:          StageHistoryEntry[];
  surveyData?:            SurveyStageData;
  proposalData?:          ProposalStageData;
  fieldReviewData?:       FieldReviewStageData;
  backendData?:           BackendStageData;
  logisticsData?:         LogisticsStageData;
  installationData?:      InstallationStageData;
  proposalAssignedTo?:         string | null;
  proposalAssignedToName?:     string;
  backendAssignedTo?:          string | null;
  backendAssignedToName?:      string;
  logisticsAssignedTo?:        string | null;
  logisticsAssignedToName?:    string;
  installationAssignedTo?:     string | null;
  installationAssignedToName?: string;
  proposalRevisionCount?:      number;
  droppedReason?:              string | null;
  documentAnswers?:            Record<string, string>;
  documentPhotos?:             Record<string, string[]>;
  documentsCompleted?:         boolean;
  paymentType:                 'cash' | 'loan' | null;
  applicationJourneySteps:     JourneyStepAnswer[];
  currentStepIndex:            number;
  journeyCompleted?:           boolean;
}

// ─── Task Update (subcollection) ───────────────────────────────────────────────

export interface TaskUpdate {
  id:               string;
  submittedBy:      string;
  submittedByName:  string;
  submittedAt:      Date;
  status:           TaskStatus;
  location:         { lat: number; lng: number; accuracy?: number } | null;
  blockedReason:    string | null;
  fieldAnswers:     Record<string, { value: string; type: FieldType }>;
  fieldPhotos:      Record<string, string[]>;
  completionPhotos: string[];
  taskNum:          string;
  title:            string;
}

// ─── Invite ────────────────────────────────────────────────────────────────────

export type InviteStatus = 'pending' | 'accepted' | 'revoked';

export interface Invite {
  id:          string;
  name:        string;
  email:       string;
  role:        UserRole;
  status:      InviteStatus;
  createdBy:   string;
  createdAt:   Date;
  expiresAt:   Date;
  acceptedAt?: Date | null;
  revokedAt?:  Date | null;
}

// ─── Offline Queue ─────────────────────────────────────────────────────────────

export interface QueuedTaskUpdate {
  id?:            number;
  taskId:         string;
  taskNum:        string;
  title:          string;
  previousStatus: TaskStatus;
  payload: {
    status:           TaskStatus;
    blockedReason:    string | null;
    fieldAnswers:     Record<string, { value: string; type: FieldType }>;
    fieldPhotos:      Record<string, string[]>;
    location:         { lat: number; lng: number; accuracy?: number } | null;
    followUpDate:     Date | string | null;
    submittedAt:      string;
    fields?:          FieldDefinition[];
    completionPhotos?: string[];
  };
  queuedAt:        number;
  attempts:        number;
  lastError?:      string;
  historyWritten?: boolean;
}
