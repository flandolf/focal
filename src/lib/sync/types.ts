import type { CalendarEvent, Project, StudySession, Subject, TimetableConfig, UserSettings } from "@/lib/types"

export type SyncTable =
  | "projects"
  | "events"
  | "study_sessions"
  | "custom_subjects"
  | "hidden_subjects"
  | "timetable_config"
  | "user_settings"

export type SyncOperation = "upsert" | "soft_delete"

export type SyncStatus = "signed-out" | "syncing" | "synced" | "pending" | "error"


export interface SyncConflictItem {
  table: SyncTable
  rowId: string
  localUpdatedAt: string | null
  remoteUpdatedAt: string | null
  remoteDeviceId: string | null
  /** Human-readable label like "Event: Math SAC" or "Project: Research Essay" */
  label: string
}
export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }

export interface SyncQueueItem {
  id: string
  table: SyncTable
  operation: SyncOperation
  rowId: string
  payload: unknown
  createdAt: string
  updatedAt: string
  retryCount: number
  lastError?: string
  nextAttemptAt?: string
}

export interface SyncMeta {
  deviceId: string
  lastPulledAt?: Partial<Record<SyncTable, string>>
  lastSuccessfulSyncAt: string | null
  migratedUuidIds?: boolean
  eventsBackfillCompletedAt?: string | null
  sessionsBackfillCompletedAt?: string | null
  localChangedAt?: Partial<Record<SyncTable, string>>
  localChangedRowIds?: Partial<Record<SyncTable, string[]>>
  deletedRowIds?: Partial<Record<SyncTable, string[]>>
}

export interface SyncStatusSnapshot {
  status: SyncStatus
  pendingCount: number
  error: string | null
  lastSuccessfulSyncAt: string | null
  details: string | null
  tableStats: { table: SyncTable; pulled?: number; pushed?: number; failed?: number }[] | null
  failedItems: { table: SyncTable; rowId: string; error: string }[] | null
  conflicts: SyncConflictItem[] | null
  isOnline: boolean
}

export interface SyncableMetadata {
  updated_at?: string
  deleted_at?: string | null
  last_modified_device_id?: string | null
}

export type LocalProject = Project & SyncableMetadata
export type LocalEvent = CalendarEvent & SyncableMetadata
export type LocalStudySession = StudySession & SyncableMetadata

export interface ProjectRow {
  id: string
  user_id: string
  name: string
  description: string | null
  icon: string | null
  deadline: string | null
  folder_path: string
  subject_id: string | null
  unit: string | null
  deadline_type: string | null
  exam_date: string | null
  is_favorite: boolean
  is_archived: boolean
  is_finished: boolean
  custom_subfolders: string[] | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  last_modified_device_id: string | null
}

export interface EventRow {
  id: string
  user_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string | null
  event_type: string
  subject_id: string | null
  location: string | null
  is_finished: boolean
  finished_at: string | null
  source: JsonValue
  created_at: string
  updated_at: string
  deleted_at: string | null
  last_modified_device_id: string | null
}

export interface StudySessionRow {
  id: string
  user_id: string
  schema_version: number
  payload: JsonValue
  project_id: string | null
  subject_ids: string[]
  title: string
  description: string | null
  start_time: string
  end_time: string
  status: string
  topics: JsonValue
  notes: string | null
  confidence: number | null
  blockers: string | null
  next_action: string | null
  active_durations: JsonValue
  completed_at: string | null
  source: JsonValue
  created_at: string
  updated_at: string
  deleted_at: string | null
  last_modified_device_id: string | null
}

export interface CustomSubjectRow {
  id: string
  user_id: string
  subject_key: string
  name: string
  short_code: string
  color: string
  icon: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  last_modified_device_id: string | null
}

export interface HiddenSubjectRow {
  id: string
  user_id: string
  subject_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  last_modified_device_id: string | null
}

export interface TimetableConfigRow {
  id: string
  user_id: string
  config: TimetableConfig
  created_at: string
  updated_at: string
  deleted_at: string | null
  last_modified_device_id: string | null
}

export interface UserSettingsRow {
  id: string
  user_id: string
  settings: UserSettings
  created_at: string
  updated_at: string
  deleted_at: string | null
  last_modified_device_id: string | null
}

export type RemoteRow =
  | ProjectRow
  | EventRow
  | StudySessionRow
  | CustomSubjectRow
  | HiddenSubjectRow
  | TimetableConfigRow
  | UserSettingsRow

export type LocalRecord = LocalProject | LocalEvent | LocalStudySession | Subject | string | TimetableConfig | UserSettings
