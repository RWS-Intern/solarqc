// ─── Auth / Users ──────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'field';

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
}

// ─── Task Form Template ────────────────────────────────────────────────────────

export type FieldType =
  | 'yesno' | 'text' | 'number' | 'select' | 'photo_only' | 'date'
  | 'measurement' | 'age' | 'section_header';

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
  orgName:             string;
  taskNumCounter:      number;
  engineerNumCounter:  number;
  taskTemplate:        FieldDefinition[];
  superAdminUid?:      string;
}

// ─── Task ──────────────────────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface Task {
  id:               string;
  taskNum:          string;
  title:            string;
  description?:     string;
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
  location:         { lat: number; lng: number } | null;
  submittedBy:      string | null;
  submittedAt:      Date | null;
  createdBy:        string;
  createdAt:        Date;
  updatedAt:        Date;
  archived:         boolean;
  archivedAt?:      Date | null;
}

// ─── Task Update (subcollection) ───────────────────────────────────────────────

export interface TaskUpdate {
  id:               string;
  submittedBy:      string;
  submittedByName:  string;
  submittedAt:      Date;
  status:           TaskStatus;
  location:         { lat: number; lng: number } | null;
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
    location:         { lat: number; lng: number } | null;
    followUpDate:     Date | string | null;
    submittedAt:      string;
  };
  queuedAt:  number;
  attempts:  number;
  lastError?: string;
}
