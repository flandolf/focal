import { compareIso } from "@/lib/sync/mappers"
import type { SyncMeta, SyncOperation, SyncQueueItem, SyncTable } from "@/lib/sync/types"

export const SYNC_TABLES: SyncTable[] = ["projects", "events", "study_sessions", "custom_subjects", "hidden_subjects", "timetable_config", "user_settings"]

export function isSyncTable(value: unknown): value is SyncTable {
  return typeof value === "string" && (SYNC_TABLES as string[]).includes(value)
}

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

export function shouldBackfillCalendarTable(table: SyncTable, backfillCompletedAt?: string | null): boolean {
  return !backfillCompletedAt && (table === "events" || table === "study_sessions")
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

export function coalesceQueueItem(
  queue: SyncQueueItem[],
  item: {
    table: SyncTable
    operation: SyncOperation
    rowId: string
    payload: unknown
  },
  id: string,
  createdAt: string,
): SyncQueueItem[] {
  const existingIndex = queue.findIndex((queued) => queued.table === item.table && queued.rowId === item.rowId)
  const nextItem: SyncQueueItem = {
    ...item,
    id,
    createdAt,
    retryCount: 0,
  }
  const updated = [...queue]
  if (existingIndex >= 0) updated[existingIndex] = nextItem
  else updated.push(nextItem)
  return updated
}

export function clearQueueItemsFromMeta(meta: SyncMeta, items: Pick<SyncQueueItem, "table" | "rowId">[]): SyncMeta {
  const localChangedAt = { ...(meta.localChangedAt ?? {}) }
  const localChangedRowIds = cloneRowIds(meta.localChangedRowIds)
  const deletedRowIds = cloneRowIds(meta.deletedRowIds)
  const changedTables = new Set<SyncTable>()

  for (const item of items) {
    changedTables.add(item.table)
    localChangedRowIds[item.table] = (localChangedRowIds[item.table] ?? []).filter((id) => id !== item.rowId)
    deletedRowIds[item.table] = (deletedRowIds[item.table] ?? []).filter((id) => id !== item.rowId)
  }

  for (const table of changedTables) {
    if ((localChangedRowIds[table] ?? []).length === 0 && (deletedRowIds[table] ?? []).length === 0) {
      delete localChangedAt[table]
    }
  }

  return { ...meta, localChangedAt, localChangedRowIds, deletedRowIds }
}

export function mergeRemoteRecords<TLocal extends { id: string; updated_at?: string | null; last_modified_device_id?: string | null }, TRemote extends { id: string; deleted_at?: string | null; last_modified_device_id?: string | null }>({
  table,
  local,
  remote,
  remoteToLocal,
  currentDeviceId,
  changedRowIds,
  deletedRowIds,
}: {
  table: SyncTable
  local: TLocal[]
  remote: TRemote[]
  remoteToLocal: (row: TRemote) => TLocal | null
  currentDeviceId: string | null
  changedRowIds?: Partial<Record<SyncTable, string[]>>
  deletedRowIds?: Partial<Record<SyncTable, string[]>>
}): TLocal[] {
  const byId = new Map(local.map((item) => [item.id, item]))

  for (const row of remote) {
    const localItem = byId.get(row.id)
    if (localItem && shouldKeepLocalRow(table, row.id, changedRowIds ?? {}, deletedRowIds ?? {})) {
      continue
    }
    if (row.deleted_at) {
      byId.delete(row.id)
      continue
    }

    const remoteLocal = remoteToLocal(row)
    if (!remoteLocal) continue

    const cmp = compareIso(remoteLocal.updated_at, localItem?.updated_at)
    if (!localItem || cmp > 0) {
      byId.set(row.id, remoteLocal)
    } else if (cmp === 0 && currentDeviceId) {
      const localDeviceId = localItem.last_modified_device_id ?? undefined
      const remoteDeviceId = row.last_modified_device_id ?? undefined
      if (localDeviceId && localDeviceId !== currentDeviceId && remoteDeviceId !== currentDeviceId) {
        byId.set(row.id, remoteLocal)
      }
    }
  }

  return Array.from(byId.values())
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

function cloneRowIds(rowIds: Partial<Record<SyncTable, string[]>> | undefined): Partial<Record<SyncTable, string[]>> {
  const next: Partial<Record<SyncTable, string[]>> = {}
  for (const table of SYNC_TABLES) {
    const ids = rowIds?.[table]
    if (ids) next[table] = [...ids]
  }
  return next
}
