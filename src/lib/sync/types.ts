import type { CalendarEvent, Project, StudySession, Subject, TimetableConfig, UserSettings } from "@/lib/types"

export const SYNC_TABLES = [
  "projects",
  "events",
  "study_sessions",
  "custom_subjects",
  "hidden_subjects",
  "timetable_config",
  "user_settings",
] as const

export type SyncTable = typeof SYNC_TABLES[number]
export type SyncOperation = "put" | "delete"
export type SyncStatus = "signed-out" | "syncing" | "synced" | "pending" | "error"

export interface SyncChange {
  changeId: string
  entity: SyncTable
  rowId: string
  operation: SyncOperation
  payload: unknown
  createdAt: string
  retryCount: number
  lastError?: string
  nextAttemptAt?: string
  blockedAt?: string
}

export interface RemoteSyncChange {
  user_id: string
  change_id: string
  device_id: string
  entity: SyncTable
  row_id: string
  operation: SyncOperation
  payload: unknown
  revision: number
  created_at: string
}

export interface SyncConflictItem {
  table: SyncTable
  rowId: string
  localUpdatedAt: string | null
  remoteUpdatedAt: string | null
  remoteDeviceId: string | null
  label: string
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

export type LocalRecord = Project | CalendarEvent | StudySession | Subject | string | TimetableConfig | UserSettings
