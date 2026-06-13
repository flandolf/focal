import { compareIso } from "@/lib/sync/mappers"
import type { SyncTable } from "@/lib/sync/types"

export const SYNC_TABLES: SyncTable[] = ["projects", "events", "study_sessions", "custom_subjects", "hidden_subjects", "timetable_config"]

export function shouldEnqueueLocalTable(
  table: SyncTable,
  changedTables: Partial<Record<SyncTable, string>>,
  lastSyncAt: string | null,
): boolean {
  return !lastSyncAt || compareIso(changedTables[table], lastSyncAt) > 0
}

export function shouldEnqueueFileRow(
  table: SyncTable,
  row: { id?: string | null; updated_at?: string | null },
  changedTables: Partial<Record<SyncTable, string>>,
  changedRowIds: Partial<Record<SyncTable, string[]>>,
  lastSyncAt: string | null,
): boolean {
  return isChangedRow(changedRowIds, table, row.id) || shouldEnqueueLocalTable(table, changedTables, lastSyncAt) || !lastSyncAt || compareIso(row.updated_at, lastSyncAt) > 0
}

export function isChangedRow(
  changedRowIds: Partial<Record<SyncTable, string[]>>,
  table: SyncTable,
  rowId: string | null | undefined,
): boolean {
  return typeof rowId === "string" && (changedRowIds[table] ?? []).includes(rowId)
}

export function shouldKeepLocalRow(
  table: SyncTable,
  rowId: string | null | undefined,
  changedRowIds: Partial<Record<SyncTable, string[]>>,
  deletedRowIds: Partial<Record<SyncTable, string[]>>,
): boolean {
  return isChangedRow(changedRowIds, table, rowId) || isChangedRow(deletedRowIds, table, rowId)
}

export function addChangedRowId(
  changedRowIds: Partial<Record<SyncTable, string[]>>,
  table: SyncTable,
  rowId: string,
): Partial<Record<SyncTable, string[]>> {
  return addUniqueRowId(changedRowIds, table, rowId)
}

export function addDeletedRowId(
  deletedRowIds: Partial<Record<SyncTable, string[]>>,
  table: SyncTable,
  rowId: string,
): Partial<Record<SyncTable, string[]>> {
  return addUniqueRowId(deletedRowIds, table, rowId)
}

export function removeDeletedRowId(
  deletedRowIds: Partial<Record<SyncTable, string[]>>,
  table: SyncTable,
  rowId: string,
): Partial<Record<SyncTable, string[]>> {
  const current = deletedRowIds[table] ?? []
  if (!current.includes(rowId)) return deletedRowIds
  return { ...deletedRowIds, [table]: current.filter((id) => id !== rowId) }
}

function addUniqueRowId(
  rowIds: Partial<Record<SyncTable, string[]>>,
  table: SyncTable,
  rowId: string,
): Partial<Record<SyncTable, string[]>> {
  const next = { ...rowIds }
  const ids = new Set(next[table] ?? [])
  ids.add(rowId)
  next[table] = Array.from(ids)
  return next
}
