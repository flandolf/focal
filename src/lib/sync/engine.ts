import type { Session, SupabaseClient } from "@supabase/supabase-js"
import { appDataDir } from "@tauri-apps/api/path"
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { supabase } from "@/lib/supabase/client"
import { getTimetableConfig, setTimetableConfig } from "@/lib/settings"
import { bustSubjectCache } from "@/lib/utils"
import { getDeviceId } from "@/lib/sync/device"
import { enqueueSyncItem, readSyncQueue, writeSyncQueue } from "@/lib/sync/queue"
import {
  compareIso,
  ensureUpdatedAt,
  eventToRow,
  hiddenSubjectToRow,
  isUuid,
  projectToRow,
  rowToEvent,
  rowToProject,
  rowToSession,
  rowToSubject,
  rowToTimetableConfig,
  sessionToRow,
  subjectToRow,
  timetableConfigToRow,
} from "@/lib/sync/mappers"
import { subscribeToSyncTables, type RealtimeChange } from "@/lib/sync/realtime"
import type {
  CustomSubjectRow,
  EventRow,
  HiddenSubjectRow,
  LocalEvent,
  LocalProject,
  LocalRecord,
  LocalStudySession,
  ProjectRow,
  RemoteRow,
  StudySessionRow,
  SyncMeta,
  SyncQueueItem,
  SyncStatusSnapshot,
  SyncTable,
  TimetableConfigRow,
} from "@/lib/sync/types"
import type { CalendarEvent, Project, StudySession, Subject } from "@/lib/types"

const META_FILE = "sync-meta.json"
const FILES: Partial<Record<SyncTable, string>> = {
  projects: "projects.json",
  events: "events.json",
  study_sessions: "sessions.json",
}
const CUSTOM_SUBJECTS_KEY = "focal-custom-subjects"
const HIDDEN_SUBJECTS_KEY = "focal-hidden-subjects"
const MISSING_SYNC_SCHEMA_MESSAGE = "Supabase sync tables are missing. Run supabase/migrations/0001_initial_sync.sql, then reload Focal."
const MAX_SYNC_RETRIES = 5
const FLUSH_INTERVAL_MS = 30_000

let currentSession: Session | null = null
let currentDeviceId: string | null = null
let unsubscribeRealtime: (() => void) | null = null
let syncDisabledReason: string | null = null
let flushPromise: Promise<void> | null = null
let flushInterval: ReturnType<typeof setInterval> | null = null
let snapshot: SyncStatusSnapshot = {
  status: "signed-out",
  pendingCount: 0,
  error: null,
  lastSuccessfulSyncAt: null,
  details: null,
  tableStats: null,
  failedItems: null,
  isOnline: true,
}
const listeners = new Set<(status: SyncStatusSnapshot) => void>()

function emitStatus(update: Partial<SyncStatusSnapshot>) {
  snapshot = { ...snapshot, ...update }
  listeners.forEach((listener) => listener(snapshot))
}

export function subscribeSyncStatus(listener: (status: SyncStatusSnapshot) => void): () => void {
  listeners.add(listener)
  listener(snapshot)
  return () => listeners.delete(listener)
}

export async function setSyncSession(session: Session | null): Promise<void> {
  currentSession = session
  syncDisabledReason = null
  unsubscribeRealtime?.()
  unsubscribeRealtime = null
  if (flushInterval) {
    clearInterval(flushInterval)
    flushInterval = null
  }

  if (!session || !supabase) {
    emitStatus({ status: "signed-out", pendingCount: 0, error: null, details: null, tableStats: null, failedItems: null, isOnline: true })
    return
  }

  currentDeviceId = await getDeviceId()
  emitStatus({ status: "syncing", error: null })

  await runInitialSync()
  if (syncDisabledReason) return

  unsubscribeRealtime = subscribeToSyncTables({
    client: supabase,
    userId: session.user.id,
    onChange: (change) => {
      void applyRealtimeChange(change)
    },
    onReconnectNeeded: () => {
      void pullRemoteChanges()
    },
  })

  // Periodic flush to catch transient failures and queue items created while offline
  flushInterval = setInterval(() => {
    void flushQueue()
  }, FLUSH_INTERVAL_MS)
}

export async function recordLocalUpsert(table: SyncTable, payload: LocalRecord): Promise<void> {
  if (!currentSession || !currentDeviceId || syncDisabledReason) return
  const row = localToRemoteRow(table, payload, currentSession.user.id, currentDeviceId)
  if (!row) return
  const queue = await enqueueSyncItem({
    table,
    operation: "upsert",
    rowId: getQueueRowId(table, payload, row),
    payload: row,
  })
  emitStatus({ status: "pending", pendingCount: queue.length, error: null, details: `Queued ${table} for sync`, isOnline: snapshot.isOnline })
  void flushQueue()
}

export async function recordLocalSoftDelete(table: SyncTable, rowId: string): Promise<void> {
  if (!currentSession || !currentDeviceId || syncDisabledReason) return
  const now = new Date().toISOString()
  const payload = table === "custom_subjects" || table === "hidden_subjects"
    ? {
      user_id: currentSession.user.id,
      deleted_at: now,
      updated_at: now,
      last_modified_device_id: currentDeviceId,
    }
    : {
      id: rowId,
      user_id: currentSession.user.id,
      deleted_at: now,
      updated_at: now,
      last_modified_device_id: currentDeviceId,
    }
  const queue = await enqueueSyncItem({
    table,
    operation: "soft_delete",
    rowId,
    payload,
  })
  emitStatus({ status: "pending", pendingCount: queue.length, error: null, details: `Queued ${table} delete for sync`, isOnline: snapshot.isOnline })
  void flushQueue()
}

export function getSyncSnapshot(): SyncStatusSnapshot {
  return snapshot
}

async function runInitialSync(): Promise<void> {
  try {
    emitStatus({ status: "syncing", error: null, details: "Migrating local IDs..." })
    await migrateLocalIdsToUuids()
    emitStatus({ status: "syncing", error: null, details: "Pulling remote changes..." })
    await pullRemoteChanges()
    emitStatus({ status: "syncing", error: null, details: "Queueing local changes..." })
    await enqueueAllLocalRows()
    emitStatus({ status: "syncing", error: null, details: "Pushing queued changes..." })
    await flushQueue()
  } catch (e) {
    if (isMissingSyncSchemaError(e)) {
      syncDisabledReason = MISSING_SYNC_SCHEMA_MESSAGE
      emitStatus({ status: "error", pendingCount: 0, error: syncDisabledReason, details: syncDisabledReason })
      return
    }
    const msg = getErrorMessage(e)
    emitStatus({ status: "error", error: msg, details: `Initial sync failed: ${msg}` })
  }
}

export async function retrySync(): Promise<void> {
  if (!currentSession) return
  syncDisabledReason = null
  emitStatus({ status: "syncing", error: null, details: "Retrying sync..." })
  await runInitialSync()
}

export async function forcePushAndMerge(): Promise<void> {
  await runForcePush("merge")
}

export async function forcePushAndOverwrite(): Promise<void> {
  await runForcePush("overwrite")
}

async function runForcePush(mode: "merge" | "overwrite"): Promise<void> {
  if (!currentSession || !currentDeviceId || syncDisabledReason) {
    emitStatus({ status: "error", error: "Not signed in or sync disabled", details: "Cannot force push while signed out or sync disabled" })
    return
  }
  const label = mode === "merge" ? "Force push & merge" : "Force push & overwrite"
  try {
    emitStatus({ status: "syncing", error: null, details: `${label} — migrating IDs...` })
    await migrateLocalIdsToUuids()
    emitStatus({ status: "syncing", error: null, details: `${label} — waiting for in-flight flush...` })
    if (flushPromise) await flushPromise
    await writeSyncQueue([])
    await enqueueAllLocalRows(true)
    emitStatus({ status: "syncing", error: null, details: `${label} — pushing all local data...` })
    await flushQueue()
    if (snapshot.status === "syncing") {
      emitStatus({ status: "error", error: "Push could not complete", details: `${label} failed — check connection and sign-in status, then try again` })
      return
    }
    if (snapshot.status === "error" && snapshot.pendingCount > 0) {
      emitStatus({ status: "error", error: snapshot.error ?? "Some items failed to push", details: `${label} halted — ${snapshot.pendingCount} item${snapshot.pendingCount === 1 ? "" : "s"} still pending after push` })
      return
    }
    if (snapshot.failedItems && snapshot.failedItems.length > 0) {
      emitStatus({ status: "error", error: snapshot.error ?? "Some items failed to push", details: `${label} complete — ${snapshot.failedItems.length} item${snapshot.failedItems.length === 1 ? "" : "s"} dropped after max retries` })
      return
    }
    if (mode === "merge") {
      emitStatus({ status: "syncing", error: null, details: `${label} — pulling remote changes...` })
      await pullRemoteChanges()
    }
    const now = new Date().toISOString()
    const meta = await readMeta()
    await writeMeta({ ...meta, lastSuccessfulSyncAt: now })
    const details = mode === "merge"
      ? "Force push & merge complete"
      : "Force push & overwrite complete — remote data was overwritten"
    emitStatus({ status: "synced", error: null, lastSuccessfulSyncAt: now, details, isOnline: true })
  } catch (e) {
    if (isMissingSyncSchemaError(e)) {
      syncDisabledReason = MISSING_SYNC_SCHEMA_MESSAGE
      emitStatus({ status: "error", error: syncDisabledReason, details: syncDisabledReason })
      return
    }
    const msg = getErrorMessage(e)
    emitStatus({ status: "error", error: msg, details: `${label} failed: ${msg}` })
  }
}

async function flushQueue(): Promise<void> {
  if (syncDisabledReason) return
  if (flushPromise) return flushPromise
  flushPromise = flushQueueInternal().finally(() => {
    flushPromise = null
  })
  return flushPromise
}

async function flushQueueInternal(): Promise<void> {
  if (!currentSession || !supabase) return
  if (!snapshot.isOnline) return
  const queue = await readSyncQueue()
  if (queue.length === 0) {
    emitStatus({ status: "synced", pendingCount: 0, error: null, lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt, details: "All changes synced", isOnline: snapshot.isOnline })
    return
  }

  emitStatus({ status: "syncing", pendingCount: queue.length, error: null, details: `Pushing ${queue.length} change${queue.length === 1 ? "" : "s"}...`, isOnline: snapshot.isOnline })

  const remaining: SyncQueueItem[] = []
  const failed: { table: string; rowId: string; error: string }[] = []
  const stats: Record<string, number> = {}
  for (const item of queue) {
    if (item.retryCount >= MAX_SYNC_RETRIES) {
      failed.push({ table: item.table, rowId: item.rowId, error: item.lastError ?? "Max retries exceeded" })
      continue
    }
    try {
      await pushQueueItem(supabase, item)
      stats[item.table] = (stats[item.table] ?? 0) + 1
    } catch (e) {
      const errMsg = getErrorMessage(e)
      console.error(`[sync] pushQueueItem failed for ${item.table} ${item.rowId}:`, errMsg, item.payload)
      remaining.push({
        ...item,
        retryCount: item.retryCount + 1,
        lastError: errMsg,
      })
      failed.push({ table: item.table, rowId: item.rowId, error: errMsg })
    }
  }

  await writeSyncQueue(remaining)
  const now = new Date().toISOString()
  const tableStats: SyncStatusSnapshot["tableStats"] = Object.entries(stats).map(([table, count]) => ({ table: table as SyncTable, pushed: count, failed: 0 }))
  console.log(`[sync] flushQueue summary: pushed=${JSON.stringify(stats)}, remaining=${remaining.length}, failed=${failed.length}${failed.length > 0 ? ", failed items: " + JSON.stringify(failed) : ""}`)
  if (remaining.length === 0 && failed.length === 0) {
    const meta = await readMeta()
    await writeMeta({ ...meta, lastSuccessfulSyncAt: now })
    emitStatus({ status: "synced", pendingCount: 0, error: null, lastSuccessfulSyncAt: now, details: `Synced ${queue.length} change${queue.length === 1 ? "" : "s"}`, tableStats, failedItems: null, isOnline: true })
  } else if (remaining.length === 0 && failed.length > 0) {
    const meta = await readMeta()
    await writeMeta({ ...meta, lastSuccessfulSyncAt: now })
    const failedItems = failed.map((f) => ({ table: f.table as SyncTable, rowId: f.rowId, error: f.error }))
    emitStatus({ status: "synced", pendingCount: 0, error: `${failed.length} item${failed.length === 1 ? "" : "s"} dropped after ${MAX_SYNC_RETRIES} retries`, details: `${failed.length} item${failed.length === 1 ? "" : "s"} dropped after max retries`, tableStats, failedItems, isOnline: true })
  } else {
    const failedItems = failed.map((f) => ({ table: f.table as SyncTable, rowId: f.rowId, error: f.error }))
    emitStatus({
      status: "error",
      pendingCount: remaining.length,
      error: remaining[0]?.lastError ?? "Some sync changes failed",
      details: `${remaining.length} change${remaining.length === 1 ? "" : "s"} pending, ${failed.length} failed`,
      tableStats,
      failedItems,
      isOnline: snapshot.isOnline,
    })
  }
}

async function pushQueueItem(client: SupabaseClient, item: SyncQueueItem): Promise<void> {
  const payload = item.payload as Record<string, unknown>
  if (item.operation === "soft_delete") {
    if (item.table === "custom_subjects") {
      const { error } = await client.from(item.table).update(payload).eq("subject_key", item.rowId)
      if (error) throw error
      return
    }
    if (item.table === "hidden_subjects") {
      const { error } = await client.from(item.table).update(payload).eq("subject_id", item.rowId)
      if (error) throw error
      return
    }
    const { error } = await client.from(item.table).update(payload).eq("id", item.rowId)
    if (error) throw error
    return
  }

  const onConflict = item.table === "custom_subjects"
    ? "user_id,subject_key"
    : item.table === "hidden_subjects"
      ? "user_id,subject_id"
      : item.table === "timetable_config"
        ? "user_id"
        : "id"
  const { error } = await client.from(item.table).upsert(payload, { onConflict })
  if (error) {
    console.error(`[sync] upsert error for ${item.table} (rowId=${item.rowId}, onConflict=${onConflict}):`, error, "payload keys:", Object.keys(payload), "payload:"
      , JSON.stringify(payload, null, 2))
    throw error
  }
}

async function pullRemoteChanges(): Promise<void> {
  if (!currentSession || !supabase || syncDisabledReason) return
  emitStatus({ status: "syncing", error: null, details: "Pulling projects..." })
  const projectCount = await pullTable<ProjectRow>("projects")
  emitStatus({ status: "syncing", error: null, details: "Pulling events..." })
  const eventCount = await pullTable<EventRow>("events")
  emitStatus({ status: "syncing", error: null, details: "Pulling study sessions..." })
  const sessionCount = await pullTable<StudySessionRow>("study_sessions")
  emitStatus({ status: "syncing", error: null, details: "Pulling custom subjects..." })
  await pullCustomSubjects()
  emitStatus({ status: "syncing", error: null, details: "Pulling hidden subjects..." })
  await pullHiddenSubjects()
  emitStatus({ status: "syncing", error: null, details: "Pulling timetable config..." })
  await pullTimetableConfig()

  // Note: we intentionally do NOT update lastSuccessfulSyncAt here.
  // enqueueAllLocalRows reads it to decide what to push; setting it to "now"
  // would cause local-only items (with older updated_at) to be skipped.
  // The meta timestamp is only updated by flushQueueInternal after a
  // successful push.

  const queue = await readSyncQueue()
  const tableStats: SyncStatusSnapshot["tableStats"] = [
    { table: "projects", pulled: projectCount, pushed: 0, failed: 0 },
    { table: "events", pulled: eventCount, pushed: 0, failed: 0 },
    { table: "study_sessions", pulled: sessionCount, pushed: 0, failed: 0 },
  ]
  emitStatus({
    status: queue.length > 0 ? "pending" : "synced",
    pendingCount: queue.length,
    error: null,
    lastSuccessfulSyncAt: new Date().toISOString(),
    details: queue.length > 0 ? `${queue.length} local change${queue.length === 1 ? "" : "s"} pending` : "Remote data pulled",
    tableStats,
  })
}

function isMissingSyncSchemaError(error: unknown): boolean {
  const code = getErrorCode(error)
  if (code === "PGRST205" || code === "42P01") return true

  const message = getErrorMessage(error).toLowerCase()
  return message.includes("could not find the table") || message.includes("schema cache")
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return String(error)
}

const PAGE_SIZE = 1000

async function pullTable<Row extends RemoteRow>(table: SyncTable): Promise<number> {
  if (!supabase) return 0
  const fileName = FILES[table]
  if (!fileName) return 0

  // Fetch all rows with pagination to avoid the default 1000-row limit.
  const allRows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as Row[]
    allRows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  const local = await readJsonArray<Record<string, unknown>>(fileName)
  const merged = mergeRemoteRows(table, local, allRows)
  await writeJsonArray(fileName, merged)
  emitLocalDataChanged(table)
  return allRows.length
}

function mergeRemoteRows(table: SyncTable, local: Record<string, unknown>[], remote: RemoteRow[]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>()
  local.forEach((item) => {
    if (typeof item.id === "string") byId.set(item.id, item)
  })

  remote.forEach((row) => {
    const localItem = byId.get(row.id)
    if (row.deleted_at) {
      byId.delete(row.id)
      return
    }

    const remoteLocal = remoteToLocal(table, row)
    if (!remoteLocal || typeof remoteLocal !== "object") return

    const remoteUpdatedAt = (remoteLocal as { updated_at?: string }).updated_at
    const localUpdatedAt = localItem?.updated_at as string | undefined
    const cmp = compareIso(remoteUpdatedAt, localUpdatedAt)

    if (!localItem || cmp > 0) {
      // Remote is newer or no local item exists
      byId.set(row.id, remoteLocal as unknown as Record<string, unknown>)
    } else if (cmp === 0 && currentDeviceId) {
      // Tie-breaker: when timestamps are equal, decide which copy wins.
      // If the remote was modified by this device, keep local (we just pushed it).
      // If the local was modified by another device, prefer remote (another device
      // saved at the same millisecond). If local lacks a device ID (pre-migration
      // data), keep local to be safe.
      const localDeviceId = localItem.last_modified_device_id as string | undefined
      const remoteDeviceId = row.last_modified_device_id as string | undefined
      if (remoteDeviceId && remoteDeviceId === currentDeviceId) {
        // Remote was modified by this device — local is authoritative
        // keep local (do nothing)
      } else if (localDeviceId && localDeviceId !== currentDeviceId) {
        // Local was modified by another device — prefer remote
        byId.set(row.id, remoteLocal as unknown as Record<string, unknown>)
      }
      // If local was modified by this device, or neither has a device ID, keep local
    }
  })

  return Array.from(byId.values())
}

async function pullCustomSubjects(): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.from("custom_subjects").select("*")
  if (error) throw error
  const local = readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY)
  const byKey = new Map(local.map((subject) => [subject.id, subject]))
  ;((data ?? []) as CustomSubjectRow[]).forEach((row) => {
    if (row.deleted_at) byKey.delete(row.subject_key)
    else byKey.set(row.subject_key, rowToSubject(row))
  })
  localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(Array.from(byKey.values())))
  bustSubjectCache()
  emitLocalDataChanged("custom_subjects")
}

async function pullHiddenSubjects(): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.from("hidden_subjects").select("*")
  if (error) throw error
  const next = new Set(readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY))
  ;((data ?? []) as HiddenSubjectRow[]).forEach((row) => {
    if (row.deleted_at) next.delete(row.subject_id)
    else next.add(row.subject_id)
  })
  localStorage.setItem(HIDDEN_SUBJECTS_KEY, JSON.stringify(Array.from(next)))
  emitLocalDataChanged("hidden_subjects")
}

async function pullTimetableConfig(): Promise<void> {
  if (!supabase || !currentSession) return
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { data, error } = await supabase.from("timetable_config").select("*").eq("user_id", currentSession.user.id).maybeSingle()
  if (error) throw error
  if (data) {
    setTimetableConfig(rowToTimetableConfig(data as TimetableConfigRow))
    emitLocalDataChanged("timetable_config")
  }
}

async function enqueueAllLocalRows(force = false): Promise<void> {
  const meta = await readMeta()
  const lastSyncAt = force ? null : meta.lastSuccessfulSyncAt

  const [projects, events, sessions] = await Promise.all([
    readJsonArray<Project>("projects.json"),
    readJsonArray<CalendarEvent>("events.json"),
    readJsonArray<StudySession>("sessions.json"),
  ])

  // Only enqueue rows that have been modified since the last successful sync
  // to avoid redundant push traffic and overwriting remote data with identical local copies.
  // In force mode, lastSyncAt is null so every row is enqueued.
  let projectEnqueued = 0
  for (const project of projects) {
    if (!lastSyncAt || compareIso(project.updated_at, lastSyncAt) > 0) {
      await recordLocalUpsert("projects", project)
      projectEnqueued++
    }
  }
  let eventEnqueued = 0
  for (const event of events) {
    if (!lastSyncAt || compareIso(event.updated_at, lastSyncAt) > 0) {
      await recordLocalUpsert("events", event)
      eventEnqueued++
    }
  }
  let sessionEnqueued = 0
  for (const session of sessions) {
    if (!lastSyncAt || compareIso(session.updated_at, lastSyncAt) > 0) {
      await recordLocalUpsert("study_sessions", session)
      sessionEnqueued++
    }
  }
  console.log(`[sync] enqueueAllLocalRows: lastSyncAt=${lastSyncAt ?? "null"}, projects=${projects.length}/${projectEnqueued}, events=${events.length}/${eventEnqueued}, sessions=${sessions.length}/${sessionEnqueued}`)
  for (const subject of readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY)) {
    await recordLocalUpsert("custom_subjects", subject)
  }
  for (const subjectId of readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY)) {
    await recordLocalUpsert("hidden_subjects", subjectId)
  }
  // timetable_config is a single-row table; always enqueue to ensure the remote
  // copy matches the current local state. A full comparison would be as expensive
  // as the upsert itself.
  await recordLocalUpsert("timetable_config", getTimetableConfig())
}

async function applyRealtimeChange(change: RealtimeChange): Promise<void> {
  if (!currentDeviceId) return
  const row = change.new ?? change.old
  if (row?.last_modified_device_id === currentDeviceId) return
  if (change.eventType === "DELETE") {
    // For custom_subjects/hidden_subjects, the local key is subject_key/subject_id,
    // not the Supabase UUID. A full refresh is safer and matches applyRemoteRow.
    if (change.table === "custom_subjects") {
      await pullCustomSubjects()
      return
    }
    if (change.table === "hidden_subjects") {
      await pullHiddenSubjects()
      return
    }
    const id = change.old?.id ?? (change.new ? ((change.new as unknown) as Record<string, unknown>).id : undefined)
    if (id) {
      await removeLocalRow(change.table, String(id))
    }
    return
  }
  if (change.new) {
    await applyRemoteRow(change.table, change.new)
  }
}

async function applyRemoteRow(table: SyncTable, row: RemoteRow): Promise<void> {
  if (table === "custom_subjects") {
    await pullCustomSubjects()
    return
  }
  if (table === "hidden_subjects") {
    await pullHiddenSubjects()
    return
  }
  if (table === "timetable_config") {
    await pullTimetableConfig()
    return
  }
  const fileName = FILES[table]
  if (!fileName) return
  const local = await readJsonArray<Record<string, unknown>>(fileName)
  const merged = mergeRemoteRows(table, local, [row])
  await writeJsonArray(fileName, merged)
  emitLocalDataChanged(table)
}

export function getSyncDisabledReason(): string | null {
  return syncDisabledReason
}

async function removeLocalRow(table: SyncTable, id: string): Promise<void> {
  if (table === "custom_subjects") {
    const local = readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY)
    const byKey = new Map(local.map((subject) => [subject.id, subject]))
    byKey.delete(id)
    localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(Array.from(byKey.values())))
    bustSubjectCache()
    emitLocalDataChanged("custom_subjects")
    return
  }
  if (table === "hidden_subjects") {
    const next = new Set(readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY))
    next.delete(id)
    localStorage.setItem(HIDDEN_SUBJECTS_KEY, JSON.stringify(Array.from(next)))
    emitLocalDataChanged("hidden_subjects")
    return
  }
  if (table === "timetable_config") {
    // timetable_config is single-row, handled by pullTimetableConfig
    return
  }
  const fileName = FILES[table]
  if (!fileName) return
  const local = await readJsonArray<Record<string, unknown>>(fileName)
  await writeJsonArray(fileName, local.filter((item) => item.id !== id))
  emitLocalDataChanged(table)
}

function localToRemoteRow(table: SyncTable, payload: LocalRecord, userId: string, deviceId: string): RemoteRow | null {
  switch (table) {
    case "projects":
      return projectToRow(payload as Project, userId, deviceId)
    case "events":
      return eventToRow(payload as CalendarEvent, userId, deviceId)
    case "study_sessions":
      return sessionToRow(payload as StudySession, userId, deviceId)
    case "custom_subjects":
      return subjectToRow(payload as Subject, userId, deviceId) as CustomSubjectRow
    case "hidden_subjects":
      return hiddenSubjectToRow(payload as string, userId, deviceId) as HiddenSubjectRow
    case "timetable_config":
      return timetableConfigToRow(payload as ReturnType<typeof getTimetableConfig>, userId, deviceId)
  }
}

function remoteToLocal(table: SyncTable, row: RemoteRow): LocalProject | LocalEvent | LocalStudySession | null {
  switch (table) {
    case "projects":
      return rowToProject(row as ProjectRow)
    case "events":
      return rowToEvent(row as EventRow)
    case "study_sessions":
      return rowToSession(row as StudySessionRow)
    default:
      return null
  }
}

function getQueueRowId(table: SyncTable, payload: LocalRecord, row: RemoteRow): string {
  if (table === "custom_subjects") return (payload as Subject).id
  if (table === "hidden_subjects") return payload as string
  return row.id
}

async function migrateLocalIdsToUuids(): Promise<void> {
  const meta = await readMeta()

  const projects = await readJsonArray<Project>("projects.json")
  const projectIdMap = new Map<string, string>()
  let changed = false
  const migratedProjects = projects.map((project) => {
    const id = isUuid(project.id) ? project.id : crypto.randomUUID()
    if (id !== project.id) {
      projectIdMap.set(project.id, id)
      changed = true
    }
    return ensureUpdatedAt({ ...project, id })
  })

  const events = await readJsonArray<CalendarEvent>("events.json")
  const migratedEvents = events.map((event) => {
    const id = isUuid(event.id) ? event.id : crypto.randomUUID()
    if (id !== event.id) changed = true
    return ensureUpdatedAt({ ...event, id })
  })

  const sessions = await readJsonArray<StudySession>("sessions.json")
  const migratedSessions = sessions.map((session) => {
    const id = isUuid(session.id) ? session.id : crypto.randomUUID()
    const projectId = session.projectId
      ? (projectIdMap.get(session.projectId) ?? (isUuid(session.projectId) ? session.projectId : undefined))
      : undefined
    if (id !== session.id || projectId !== session.projectId) changed = true
    return ensureUpdatedAt({ ...session, id, projectId })
  })

  if (changed) {
    await Promise.all([
      writeJsonArray("projects.json", migratedProjects),
      writeJsonArray("events.json", migratedEvents),
      writeJsonArray("sessions.json", migratedSessions),
    ])
    emitLocalDataChanged("projects")
    emitLocalDataChanged("events")
    emitLocalDataChanged("study_sessions")
  }
  if (!meta.migratedUuidIds || changed) {
    await writeMeta({ ...meta, migratedUuidIds: true })
  }
}

async function readMeta(): Promise<SyncMeta> {
  const deviceId = currentDeviceId ?? await getDeviceId()
  try {
    const path = await appDataPath(META_FILE)
    if (!(await exists(path))) return { deviceId, lastSuccessfulSyncAt: null }
    const parsed = JSON.parse(await readTextFile(path)) as Partial<SyncMeta>
    return {
      deviceId,
      lastPulledAt: parsed.lastPulledAt,
      lastSuccessfulSyncAt: parsed.lastSuccessfulSyncAt ?? null,
      migratedUuidIds: parsed.migratedUuidIds,
    }
  } catch {
    return { deviceId, lastSuccessfulSyncAt: null }
  }
}

async function writeMeta(meta: SyncMeta): Promise<void> {
  const path = await appDataPath(META_FILE)
  await writeTextFile(path, JSON.stringify(meta, null, 2))
}

async function appDataPath(fileName: string): Promise<string> {
  const baseDir = await appDataDir()
  if (!(await exists(baseDir))) {
    await mkdir(baseDir, { recursive: true })
  }
  return `${baseDir}/${fileName}`
}

async function readJsonArray<T>(fileName: string): Promise<T[]> {
  try {
    const path = await appDataPath(fileName)
    if (!(await exists(path))) return []
    const parsed: unknown = JSON.parse(await readTextFile(path))
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

async function writeJsonArray(fileName: string, items: unknown[]): Promise<void> {
  const path = await appDataPath(fileName)
  await writeTextFile(path, JSON.stringify(items, null, 2))
}

function readLocalStorageArray<T>(key: string): T[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

function emitLocalDataChanged(table: SyncTable): void {
  window.dispatchEvent(new CustomEvent("focal-sync-data-changed", { detail: { table, fileName: FILES[table] } }))
  if (table === "timetable_config") {
    window.dispatchEvent(new CustomEvent("focal-timetable-updated"))
  }
}

// Auto-flush when browser comes back online
function handleOnline() {
  emitStatus({ isOnline: true })
  void flushQueue()
}

function handleOffline() {
  emitStatus({ isOnline: false })
}

if (typeof window !== "undefined") {
  window.addEventListener("online", handleOnline)
  window.addEventListener("offline", handleOffline)
  if (typeof navigator !== "undefined") {
    emitStatus({ isOnline: navigator.onLine })
  }
}
