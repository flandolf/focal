import type { CalendarEvent, Project, StudySession, Subject, TimetableConfig } from "@/lib/types"

export type SyncTable =
  | "projects"
  | "events"
  | "study_sessions"
  | "custom_subjects"
  | "hidden_subjects"
  | "timetable_config"

export type SyncOperation = "upsert" | "soft_delete"

export type SyncStatus = "signed-out" | "syncing" | "synced" | "pending" | "error"

export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue }

export interface SyncQueueItem {
  id: string
  table: SyncTable
  operation: SyncOperation
  rowId: string
  payload: unknown
  createdAt: string
  retryCount: number
  lastError?: string
}

export interface SyncMeta {
  deviceId: string
  lastPulledAt?: Partial<Record<SyncTable, string>>
  lastSuccessfulSyncAt?: string
  migratedUuidIds?: boolean
}

export interface SyncStatusSnapshot {
  status: SyncStatus
  pendingCount: number
  error: string | null
  lastSuccessfulSyncAt: string | null
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

export type RemoteRow =
  | ProjectRow
  | EventRow
  | StudySessionRow
  | CustomSubjectRow
  | HiddenSubjectRow
  | TimetableConfigRow

export type LocalRecord = LocalProject | LocalEvent | LocalStudySession | Subject | string | TimetableConfig
