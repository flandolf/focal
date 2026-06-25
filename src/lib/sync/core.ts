/**
 * Core sync primitives: table definitions, row-ID tracking, merge logic, and
 * queue coalescing. This module is stateless — all mutable state lives in
 * engine.ts or queue.ts.
 */
import { compareIso } from "@/lib/sync/mappers"
import type { SyncConflictItem, SyncMeta, SyncOperation, SyncQueueItem, SyncTable } from "@/lib/sync/types"
import type { UserSettings } from "@/lib/types"

export const SYNC_TABLES: SyncTable[] = ["projects", "events", "study_sessions", "custom_subjects", "hidden_subjects", "timetable_config", "user_settings"]

export function isSyncTable(value: unknown): value is SyncTable {
  return typeof value === "string" && (SYNC_TABLES as string[]).includes(value)
}

export function scrubUserSettingsSecrets(settings: UserSettings): UserSettings {
  // ponytail: account sync stores settings as plaintext JSON; keep bearer secrets local-only.
  return { ...settings, openrouter_api_key: "", notion_token: "" }
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
    updatedAt: createdAt,
    retryCount: 0,
  }
  const updated = [...queue]
  if (existingIndex >= 0) updated[existingIndex] = nextItem
  else updated.push(nextItem)
  return updated
}

export function isQueueItemDue(item: Pick<SyncQueueItem, "nextAttemptAt">, nowIso: string): boolean {
  return !item.nextAttemptAt || compareIso(item.nextAttemptAt, nowIso) <= 0
}

export function isRowInPullWindow(
  row: { updated_at?: string | null },
  lastPulledAt: string | null | undefined,
  highWaterAt: string,
): boolean {
  return compareIso(row.updated_at, lastPulledAt) > 0 && compareIso(row.updated_at, highWaterAt) <= 0
}

export function retryQueueItem(item: SyncQueueItem, error: string, nowIso: string): SyncQueueItem {
  const retryCount = item.retryCount + 1
  return {
    ...item,
    retryCount,
    lastError: error,
    nextAttemptAt: new Date(new Date(nowIso).getTime() + getRetryDelayMs(retryCount)).toISOString(),
    updatedAt: nowIso,
  }
}

function getRetryDelayMs(retryCount: number): number {
  // ponytail: capped exponential backoff; add jitter only if real users stampede Supabase.
  return Math.min(5 * 60_000, 2 ** Math.max(0, retryCount - 1) * 5_000)
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
  conflicts,
}: {
  table: SyncTable
  local: TLocal[]
  remote: TRemote[]
  remoteToLocal: (row: TRemote) => TLocal | null
  currentDeviceId: string | null
  changedRowIds?: Partial<Record<SyncTable, string[]>>
  deletedRowIds?: Partial<Record<SyncTable, string[]>>
  conflicts?: SyncConflictItem[]
}): TLocal[] {
  const byId = new Map(local.map((item) => [item.id, item]))

  for (const row of remote) {
    const localItem = byId.get(row.id)
    if (row.deleted_at) {
      if (localItem && shouldKeepLocalRow(table, row.id, changedRowIds ?? {}, deletedRowIds ?? {})) {
        // Conflict: local was modified, remote was deleted by another device
        conflicts?.push({
          table,
          rowId: row.id,
          localUpdatedAt: localItem.updated_at ?? null,
          remoteUpdatedAt: row.deleted_at,
          remoteDeviceId: row.last_modified_device_id ?? null,
          label: buildConflictLabel(table, localItem),
        })
      } else {
        byId.delete(row.id)
      }
      continue
    }

    if (localItem && shouldKeepLocalRow(table, row.id, changedRowIds ?? {}, deletedRowIds ?? {})) {
      // Both local and remote were modified; if by different devices, it's a conflict
      const localDevice = localItem.last_modified_device_id ?? null
      const remoteDevice = row.last_modified_device_id ?? null
      if (remoteDevice && localDevice !== remoteDevice) {
        conflicts?.push({
          table,
          rowId: row.id,
          localUpdatedAt: localItem.updated_at ?? null,
          remoteUpdatedAt: ((row as unknown as Record<string, unknown>).updated_at as string) ?? null,
          remoteDeviceId: remoteDevice,
          label: buildConflictLabel(table, localItem),
        })
      }
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

/** Build a human-readable label for a conflict item. */
/** Build a human-readable label for a conflict item. */
function buildConflictLabel(table: SyncTable, item: Record<string, unknown> | { id: string; name?: unknown; title?: unknown }): string {
  const name = typeof item.name === "string" ? item.name : typeof item.title === "string" ? item.title : null
  if (name) return `${table.replace(/_/g, " ")}: ${name}`
  return `${table.replace(/_/g, " ")} ${typeof item.id === "string" ? item.id.slice(0, 8) : typeof item.id === "number" ? String(item.id).slice(0, 8) : "?"}`
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
