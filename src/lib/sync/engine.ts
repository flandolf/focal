import type { Session, SupabaseClient } from "@supabase/supabase-js"
import { appDataDir } from "@tauri-apps/api/path"
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { supabase } from "@/lib/supabase/client"
import { getAssistantCustomInstructions, getAssistantPersonality, getModel, getNotionCalendarSettings, getOllamaBaseUrl, getOllamaModel, getProvider, getReasoningEffort, getReasoningExclude, getReasoningMaxTokens, getTimetableConfig, setAssistantCustomInstructions, setAssistantPersonality, setModel, setNotionCalendarSettings, setOllamaBaseUrl, setOllamaModel, setProvider, setReasoningEffort, setReasoningExclude, setReasoningMaxTokens, setTimetableConfig, type AssistantPersonality, type ReasoningEffort } from "@/lib/settings"
import { bustSubjectCache, getErrorMessage } from "@/lib/utils"
import { addChangedRowId, addDeletedRowId, clearQueueItemsFromMeta, isChangedRow, isQueueItemDue, mergeRemoteRecords, removeDeletedRowId, retryQueueItem, scrubUserSettingsSecrets, shouldBackfillCalendarTable, shouldEnqueueFileRow, SYNC_TABLES } from "@/lib/sync/core"
import { getDeviceId } from "@/lib/sync/device"
import { enqueueSyncItem, finishSyncQueueFlush, readSyncQueue, writeSyncQueue } from "@/lib/sync/queue"
import { readStoredMeta, writeStoredMeta } from "@/lib/sync/store"
import {
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
  rowToUserSettings,
  sessionToRow,
  subjectToRow,
  timetableConfigToRow,
  userSettingsToRow,
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
  SyncConflictItem,
  SyncMeta,
  SyncQueueItem,
  SyncStatusSnapshot,
  SyncTable,
  TimetableConfigRow,
  UserSettingsRow,
} from "@/lib/sync/types"
import type { CalendarEvent, Project, StudySession, Subject, UserSettings } from "@/lib/types"
const FILES: Partial<Record<SyncTable, string>> = {
  projects: "projects.json",
  events: "events.json",
  study_sessions: "sessions.json",
}
const CUSTOM_SUBJECTS_KEY = "focal-custom-subjects"
const HIDDEN_SUBJECTS_KEY = "focal-hidden-subjects"
const MISSING_SYNC_SCHEMA_MESSAGE = "Supabase sync tables are missing. Run supabase/migrations/0001_initial_sync.sql, then reload Focal."
const MAX_SYNC_RETRIES = 5
const MAX_SYNC_RETRIES_TRANSIENT = 8
const FLUSH_INTERVAL_MS = 30_000
const PULL_INTERVAL_MS = 120_000
let currentSession: Session | null = null
let currentDeviceId: string | null = null
let unsubscribeRealtime: (() => void) | null = null
let syncDisabledReason: string | null = null
let flushPromise: Promise<void> | null = null
let pullPromise: Promise<void> | null = null
let metaLock: Promise<unknown> = Promise.resolve()
let flushInterval: ReturnType<typeof setInterval> | null = null
let pullInterval: ReturnType<typeof setInterval> | null = null
let snapshot: SyncStatusSnapshot = {
  status: "signed-out",
  pendingCount: 0,
  error: null,
  lastSuccessfulSyncAt: null,
  details: null,
  tableStats: null,
  failedItems: null,
  conflicts: null,
  isOnline: true,
}
const listeners = new Set<(status: SyncStatusSnapshot) => void>()

// Accumulated failed items that persist across status updates until explicitly cleared
let persistedFailedItems: SyncStatusSnapshot["failedItems"] = []
let persistedConflicts: SyncStatusSnapshot["conflicts"] = []

const SECRET_SETTING_KEYS = ["openrouter_api_key", "notion_token"] as const

function userSettingsHasSecrets(settings: Partial<UserSettings> | null | undefined): boolean {
  return SECRET_SETTING_KEYS.some((key) => typeof settings?.[key] === "string" && settings[key].trim() !== "")
}

function sanitizeSyncPayload(table: SyncTable, payload: unknown): unknown {
  if (table !== "user_settings" || typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return payload
  }
  const row = payload as Record<string, unknown>
  if (typeof row.settings !== "object" || row.settings === null || Array.isArray(row.settings)) {
    return payload
  }
  return {
    ...row,
    settings: scrubUserSettingsSecrets(row.settings as UserSettings),
  }
}

function sanitizeQueueItem(item: SyncQueueItem): SyncQueueItem {
  return { ...item, payload: sanitizeSyncPayload(item.table, item.payload) }
}

function redactedPayloadSummary(table: SyncTable, payload: unknown): unknown {
  const sanitized = sanitizeSyncPayload(table, payload)
  if (typeof sanitized !== "object" || sanitized === null || Array.isArray(sanitized)) return sanitized
  const row = sanitized as Record<string, unknown>
  return {
    keys: Object.keys(row),
    settingsKeys: typeof row.settings === "object" && row.settings !== null && !Array.isArray(row.settings)
      ? Object.keys(row.settings)
      : undefined,
  }
}

function emitStatus(update: Partial<SyncStatusSnapshot>) {
  // Merge new failed items with persisted ones; keep old failures not in the new set.
  const newFailedItems = update.failedItems
  if (newFailedItems !== undefined) {
    const newIds = new Set(newFailedItems?.map((f) => `${f.table}:${f.rowId}`) ?? [])
    const kept = (persistedFailedItems ?? []).filter((f) => !newIds.has(`${f.table}:${f.rowId}`))
    persistedFailedItems = [...kept, ...(newFailedItems ?? [])]
  }
  // Merge new conflicts with persisted ones; keep old conflicts not in the new set.
  const newConflicts = update.conflicts
  if (newConflicts !== undefined) {
    const newIds = new Set(newConflicts?.map((c) => `${c.table}:${c.rowId}`) ?? [])
    const kept = (persistedConflicts ?? []).filter((c) => !newIds.has(`${c.table}:${c.rowId}`))
    persistedConflicts = [...kept, ...(newConflicts ?? [])]
  }
  snapshot = { ...snapshot, ...update, failedItems: persistedFailedItems, conflicts: persistedConflicts }
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
  if (pullInterval) {
    clearInterval(pullInterval)
    pullInterval = null
  }

  if (!session || !supabase) {
    persistedFailedItems = []
    persistedConflicts = []
    emitStatus({ status: "signed-out", pendingCount: 0, error: null, details: null, tableStats: null, failedItems: [], conflicts: [], isOnline: true })
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

  // Periodic pull as a safety net — catches remote changes missed by realtime
  // subscriptions (e.g. during reconnection gaps).
  pullInterval = setInterval(() => {
    void pullRemoteChanges()
  }, PULL_INTERVAL_MS)
}

export async function recordLocalUpsert(table: SyncTable, payload: LocalRecord): Promise<void> {
  await markLocalUpsert(table, payload)
  if (!currentSession || !currentDeviceId || syncDisabledReason) {
    return
  }
  const queue = await enqueueRemoteUpsert(table, payload)
  if (!queue) return
  emitStatus({ status: "pending", pendingCount: queue.length, error: null, details: `Queued ${table} for sync`, isOnline: snapshot.isOnline })
  void flushQueue()
}

async function enqueueRemoteUpsert(table: SyncTable, payload: LocalRecord): Promise<SyncQueueItem[] | null> {
  if (!currentSession || !currentDeviceId) return null
  const row = localToRemoteRow(table, payload, currentSession.user.id, currentDeviceId)
  if (!row) return null
  return enqueueSyncItem({
    table,
    operation: "upsert",
    rowId: getQueueRowId(table, payload, row),
    payload: sanitizeSyncPayload(table, row),
  })
}

export async function recordLocalSoftDelete(table: SyncTable, rowId: string): Promise<void> {
  await markLocalDelete(table, rowId)
  if (!currentSession || !currentDeviceId || syncDisabledReason) {
    return
  }
  const queue = await enqueueRemoteSoftDelete(table, rowId)
  if (!queue) return
  emitStatus({ status: "pending", pendingCount: queue.length, error: null, details: `Queued ${table} delete for sync`, isOnline: snapshot.isOnline })
  void flushQueue()
}

async function enqueueRemoteSoftDelete(table: SyncTable, rowId: string): Promise<SyncQueueItem[] | null> {
  if (!currentSession || !currentDeviceId) return null
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
  return enqueueSyncItem({
    table,
    operation: "soft_delete",
    rowId,
    payload,
  })
}

async function runInitialSync(): Promise<void> {
  try {
    emitStatus({ status: "syncing", error: null, details: "Migrating local IDs..." })
    await migrateLocalIdsToUuids()
    emitStatus({ status: "syncing", error: null, details: "Queueing local changes..." })
    await enqueueAllLocalRows()
    emitStatus({ status: "syncing", error: null, details: "Pushing queued changes..." })
    await flushQueue()
    emitStatus({ status: "syncing", error: null, details: "Pulling remote changes..." })
    await pullRemoteChanges()
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

/** Collect all user settings from localStorage and trigger a sync upsert. */
export function notifyUserSettingsChanged(): void {
  void recordLocalUpsert("user_settings", collectUserSettingsForSync())
}

export async function retrySync(): Promise<void> {
  if (!currentSession) return
  syncDisabledReason = null
  emitStatus({ status: "syncing", error: null, details: "Retrying sync..." })
  await runInitialSync()
}

/** Manually pull remote changes without pushing local changes first. */
export async function pullNow(): Promise<void> {
  if (!currentSession) {
    emitStatus({ status: "error", error: "Not signed in", details: "Sign in to pull remote changes" })
    return
  }
  if (syncDisabledReason) {
    emitStatus({ status: "error", error: syncDisabledReason, details: syncDisabledReason })
    return
  }
  emitStatus({ status: "syncing", error: null, details: "Pulling remote changes..." })
  await pullRemoteChanges()
}

/** Manually push queued local changes without pulling remote first. */
export async function pushNow(): Promise<void> {
  if (!currentSession) {
    emitStatus({ status: "error", error: "Not signed in", details: "Sign in to push local changes" })
    return
  }
  if (syncDisabledReason) {
    emitStatus({ status: "error", error: syncDisabledReason, details: syncDisabledReason })
    return
  }
  emitStatus({ status: "syncing", error: null, details: "Pushing local changes..." })
  await flushQueue()
}

/** Clear all persisted failed items from the status snapshot. */
export function clearFailedItems(): void {
  persistedFailedItems = []
  emitStatus({ failedItems: [] })
}

/** Re-queue a single failed item for retry. */
export async function retryFailedItem(table: SyncTable, rowId: string): Promise<void> {
  // Remove from persisted failed items
  persistedFailedItems = (persistedFailedItems ?? []).filter(
    (f) => !(f.table === table && f.rowId === rowId),
  )
  emitStatus({ failedItems: persistedFailedItems })
  // The item is still in the sync meta changedRowIds, so enqueueAllLocalRows will pick it up
  await enqueueAllLocalRows(true)
  await flushQueue()
}

/** Drop a specific failed item from both the failed list and the queue. */
export async function dropQueueItem(table: SyncTable, rowId: string): Promise<void> {
  persistedFailedItems = (persistedFailedItems ?? []).filter(
    (f) => !(f.table === table && f.rowId === rowId),
  )
  emitStatus({ failedItems: persistedFailedItems })
  // Remove from sync meta so it won't be re-enqueued
  await updateMeta((meta) => {
    const changedRowIds = { ...meta.localChangedRowIds }
    const arr = changedRowIds[table] ?? []
    changedRowIds[table] = arr.filter((id) => id !== rowId)
    const deletedRowIds = { ...meta.deletedRowIds }
    const delArr = deletedRowIds[table] ?? []
    deletedRowIds[table] = delArr.filter((id) => id !== rowId)
    return { ...meta, localChangedRowIds: changedRowIds, deletedRowIds }
  })
  // Remove from queue file too
  const queue = await readSyncQueue()
  const remaining = queue.filter((item) => !(item.table === table && item.rowId === rowId))
  await writeSyncQueue(remaining)
}

/** Resolve a sync conflict by accepting the remote version. */
export async function resolveConflictAcceptRemote(table: SyncTable, rowId: string): Promise<void> {
  // Remove from conflicts list
  persistedConflicts = (persistedConflicts ?? []).filter(
    (c) => !(c.table === table && c.rowId === rowId),
  )
  emitStatus({ conflicts: persistedConflicts })
  // Remove from changedRowIds so the next pull will accept the remote version
  await updateMeta((meta) => {
    const changedRowIds = { ...meta.localChangedRowIds }
    const arr = changedRowIds[table] ?? []
    changedRowIds[table] = arr.filter((id) => id !== rowId)
    return { ...meta, localChangedRowIds: changedRowIds }
  })
  // Pull to get the remote version
  await pullRemoteChanges()
}

/** Resolve a sync conflict by keeping the local version (and pushing it). */
export async function resolveConflictKeepLocal(table: SyncTable, rowId: string): Promise<void> {
  // Remove from conflicts list
  persistedConflicts = (persistedConflicts ?? []).filter(
    (c) => !(c.table === table && c.rowId === rowId),
  )
  emitStatus({ conflicts: persistedConflicts })
  // Push the local version to overwrite remote
  await enqueueAllLocalRows(true)
  await flushQueue()
}

/** Dismiss a conflict without any action (keeps local, will re-appear on next pull). */
export function dismissConflict(table: SyncTable, rowId: string): void {
  persistedConflicts = (persistedConflicts ?? []).filter(
    (c) => !(c.table === table && c.rowId === rowId),
  )
  emitStatus({ conflicts: persistedConflicts })
}

/** Clear all persisted conflicts. */
export function clearConflicts(): void {
  persistedConflicts = []
  emitStatus({ conflicts: [] })
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
    await updateMeta((meta) => ({ ...meta, lastSuccessfulSyncAt: now }))
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
  // Wait for any in-progress flush to finish so newly-enqueued items
  // (added during that flush) get pushed promptly.
  if (flushPromise) {
    try { await flushPromise } catch { /* ignore; we'll retry below */ }
  }
  // If another caller already started a new flush while we awaited, piggyback.
  if (flushPromise) return flushPromise
  flushPromise = flushQueueInternal().finally(() => {
    flushPromise = null
  })
  return flushPromise
}

async function flushQueueInternal(): Promise<void> {
  if (!currentSession || !supabase) return
  if (!snapshot.isOnline) return
  const rawQueue = await readSyncQueue()
  const queue = rawQueue.map(sanitizeQueueItem)
  if (JSON.stringify(queue) !== JSON.stringify(rawQueue)) {
    await writeSyncQueue(queue)
  }
  if (queue.length === 0) {
    emitStatus({ status: "synced", pendingCount: 0, error: null, lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt, details: "All changes synced", isOnline: snapshot.isOnline })
    return
  }
  const startedAt = new Date().toISOString()
  const dueQueue = queue.filter((item) => isQueueItemDue(item, startedAt))
  if (dueQueue.length === 0) {
    const nextAttemptAt = queue
      .map((item) => item.nextAttemptAt)
      .filter((value): value is string => typeof value === "string")
      .sort()[0]
    emitStatus({
      status: "pending",
      pendingCount: queue.length,
      error: null,
      details: nextAttemptAt ? `${queue.length} change${queue.length === 1 ? "" : "s"} waiting to retry` : `${queue.length} change${queue.length === 1 ? "" : "s"} pending`,
      isOnline: snapshot.isOnline,
    })
    return
  }

  // Report per-table breakdown in details
  const byTable = new Map<SyncTable, number>()
  for (const item of dueQueue) byTable.set(item.table, (byTable.get(item.table) ?? 0) + 1)
  const breakdown = [...byTable.entries()].map(([t, c]) => `${t.replace(/_/g, " ")}: ${c}`).join(", ")
  emitStatus({ status: "syncing", pendingCount: queue.length, error: null, details: `Pushing ${dueQueue.length} change${dueQueue.length === 1 ? "" : "s"} (${breakdown})`, isOnline: snapshot.isOnline })

  const remaining: SyncQueueItem[] = []
  const failed: { table: string; rowId: string; error: string }[] = []
  const stats: Record<string, number> = {}
  const processedIds: string[] = []
  const droppedItems: SyncQueueItem[] = []
  let pausedForNetworkError = false
  const maxRetries = MAX_SYNC_RETRIES_TRANSIENT
  const batches = buildPushBatches(dueQueue)
  let pushedSoFar = 0
  for (const batch of batches) {
    const item = batch[0]
    const alreadyMaxed = batch.filter((queued) => queued.retryCount >= MAX_SYNC_RETRIES)
    for (const maxed of alreadyMaxed) {
      failed.push({ table: maxed.table, rowId: maxed.rowId, error: maxed.lastError ?? "Max retries exceeded" })
      processedIds.push(maxed.id)
      droppedItems.push(maxed)
    }
    const pushable = batch.filter((queued) => queued.retryCount < MAX_SYNC_RETRIES)
    if (pushable.length === 0) continue
    // Emit per-item progress every 10 items or on table change
    if (pushedSoFar > 0 && (pushedSoFar % 10 === 0 || item.table !== dueQueue[pushedSoFar - 1]?.table)) {
      emitStatus({
        status: "syncing",
        pendingCount: queue.length - pushedSoFar,
        error: null,
        details: `Pushing ${item.table.replace(/_/g, " ")} (${pushedSoFar + 1}/${dueQueue.length})...`,
        isOnline: snapshot.isOnline,
      })
    }
    try {
      await pushQueueBatch(supabase, pushable)
      stats[item.table] = (stats[item.table] ?? 0) + pushable.length
      processedIds.push(...pushable.map((queued) => queued.id))
    } catch (e) {
      const errMsg = getErrorMessage(e)
      console.error(`[sync] pushQueueItem failed for ${item.table} ${pushable.map((queued) => queued.rowId).join(",")}:`, errMsg, redactedPayloadSummary(item.table, pushable[0]?.payload))
      processedIds.push(...pushable.map((queued) => queued.id))
      if (isTransientSyncError(e)) {
        // Exponential backoff: items with network errors get up to MAX_SYNC_RETRIES_TRANSIENT retries
        for (const queued of pushable) {
          if (queued.retryCount + 1 >= maxRetries) {
            failed.push({ table: queued.table, rowId: queued.rowId, error: errMsg })
            droppedItems.push(queued)
          } else {
            remaining.push(retryQueueItem(queued, errMsg, startedAt))
            failed.push({ table: queued.table, rowId: queued.rowId, error: errMsg })
          }
        }
        pausedForNetworkError = true
        break
      }
      // Non-transient errors (e.g., schema mismatch, constraint violations)
      for (const queued of pushable) {
        if (queued.retryCount + 1 >= MAX_SYNC_RETRIES) {
          failed.push({ table: queued.table, rowId: queued.rowId, error: errMsg })
          droppedItems.push(queued)
        } else {
          remaining.push(retryQueueItem(queued, errMsg, startedAt))
          failed.push({ table: queued.table, rowId: queued.rowId, error: errMsg })
        }
      }
    }
    pushedSoFar += pushable.length
  }

  const nextQueue = await finishSyncQueueFlush(processedIds, remaining)
  const pendingCount = nextQueue.length
  const now = new Date().toISOString()
  const tableStats: SyncStatusSnapshot["tableStats"] = Object.entries(stats).map(([table, count]) => ({
    table: table as SyncTable,
    pushed: count,
    failed: failed.filter((f) => f.table === table).length,
  }))
  // Add tables with pushed=0 but have failed items
  for (const f of failed) {
    if (!stats[f.table]) {
      tableStats.push({ table: f.table as SyncTable, pushed: 0, failed: 1 })
    }
  }
  console.warn(`[sync] flushQueue summary: pushed=${JSON.stringify(stats)}, remaining=${pendingCount}, failed=${failed.length}${failed.length > 0 ? ", failed items: " + JSON.stringify(failed) : ""}`)
  const failedItems = failed.map((f) => ({ table: f.table as SyncTable, rowId: f.rowId, error: f.error }))
  if (pendingCount === 0 && failed.length === 0) {
    await updateMeta((meta) => ({ ...meta, lastSuccessfulSyncAt: now, eventsBackfillCompletedAt: stats.events ? (meta.eventsBackfillCompletedAt ?? now) : meta.eventsBackfillCompletedAt, sessionsBackfillCompletedAt: stats.study_sessions ? (meta.sessionsBackfillCompletedAt ?? now) : meta.sessionsBackfillCompletedAt, localChangedAt: {}, localChangedRowIds: {}, deletedRowIds: {} }))
    emitStatus({ status: "synced", pendingCount: 0, error: null, lastSuccessfulSyncAt: now, details: `Synced ${dueQueue.length} change${dueQueue.length === 1 ? "" : "s"}`, tableStats, failedItems: [], isOnline: true })
  } else if (pendingCount === 0 && failed.length > 0) {
    await updateMeta((meta) => ({ ...clearQueueItemsFromMeta(meta, droppedItems), lastSuccessfulSyncAt: now, eventsBackfillCompletedAt: stats.events ? (meta.eventsBackfillCompletedAt ?? now) : meta.eventsBackfillCompletedAt, sessionsBackfillCompletedAt: stats.study_sessions ? (meta.sessionsBackfillCompletedAt ?? now) : meta.sessionsBackfillCompletedAt }))
    const errSummary = failed.length === 1 ? failed[0].error : `${failed.length} items dropped after retries`
    emitStatus({ status: "error", pendingCount: 0, error: errSummary, details: `${failed.length} item${failed.length === 1 ? "" : "s"} failed after max retries — review below`, tableStats, failedItems, isOnline: true })
  } else {
    const firstError = remaining[0]?.lastError ?? failed[0]?.error ?? "Some sync changes failed"
    emitStatus({
      status: pausedForNetworkError ? "pending" : "error",
      pendingCount,
      error: pausedForNetworkError ? null : firstError,
      details: pausedForNetworkError
        ? `${pendingCount} change${pendingCount === 1 ? "" : "s"} waiting for network`
        : `${pendingCount} change${pendingCount === 1 ? "" : "s"} pending, ${failed.length} failed — tap to retry or review`,
      tableStats,
      failedItems,
      isOnline: snapshot.isOnline,
    })
  }
}

function buildPushBatches(queue: SyncQueueItem[]): SyncQueueItem[][] {
  const upserts = new Map<SyncTable, SyncQueueItem[]>()
  const batches: SyncQueueItem[][] = []
  for (const item of queue) {
    if (item.operation === "upsert") {
      const items = upserts.get(item.table) ?? []
      items.push(item)
      upserts.set(item.table, items)
    } else {
      batches.push([item])
    }
  }
  return [...upserts.values(), ...batches]
}

async function pushQueueBatch(client: SupabaseClient, items: SyncQueueItem[]): Promise<void> {
  if (items.length === 1 || items[0]?.operation !== "upsert") {
    for (const item of items) await pushQueueItem(client, item)
    return
  }
  const table = items[0].table
  const payloads = items.map((item) => sanitizeSyncPayload(item.table, item.payload) as Record<string, unknown>)
  const { error } = await client.from(table).upsert(payloads, { onConflict: getUpsertConflictTarget(table) })
  if (error) {
    console.error(`[sync] batch upsert error for ${table}:`, error, "payload:", redactedPayloadSummary(table, payloads[0]))
    throw error
  }
}

async function pushQueueItem(client: SupabaseClient, item: SyncQueueItem): Promise<void> {
  const payload = sanitizeSyncPayload(item.table, item.payload) as Record<string, unknown>
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

  const onConflict = getUpsertConflictTarget(item.table)
  const { error } = await client.from(item.table).upsert(payload, { onConflict })
  if (error) {
    console.error(`[sync] upsert error for ${item.table} (rowId=${item.rowId}, onConflict=${onConflict}):`, error, "payload:", redactedPayloadSummary(item.table, payload))
    throw error
  }
}

function getUpsertConflictTarget(table: SyncTable): string {
  return table === "custom_subjects"
    ? "user_id,subject_key"
    : table === "hidden_subjects"
      ? "user_id,subject_id"
      : table === "timetable_config" || table === "user_settings"
        ? "user_id"
        : "id"
}

async function pullRemoteChanges(): Promise<void> {
  if (pullPromise) return pullPromise
  pullPromise = pullRemoteChangesInternal().finally(() => {
    pullPromise = null
  })
  return pullPromise
}

async function pullRemoteChangesInternal(): Promise<void> {
  if (!currentSession || !supabase || syncDisabledReason) return
  const highWaterAt = new Date().toISOString()
  emitStatus({ status: "syncing", pendingCount: snapshot.pendingCount, error: null, details: "Pulling projects..." })
  const projectCount = await pullTable<ProjectRow>("projects", highWaterAt)
  emitStatus({ status: "syncing", pendingCount: snapshot.pendingCount, error: null, details: projectCount > 0 ? `Pulling events... (${projectCount} projects received)` : "Pulling events..." })
  const eventCount = await pullTable<EventRow>("events", highWaterAt)
  emitStatus({ status: "syncing", pendingCount: snapshot.pendingCount, error: null, details: eventCount > 0 ? `Pulling sessions... (${eventCount} events received)` : "Pulling sessions..." })
  const sessionCount = await pullTable<StudySessionRow>("study_sessions", highWaterAt)
  const detailPrefix = [
    projectCount > 0 ? `${projectCount} projects` : null,
    eventCount > 0 ? `${eventCount} events` : null,
    sessionCount > 0 ? `${sessionCount} sessions` : null,
  ].filter(Boolean).join(", ")
  emitStatus({ status: "syncing", pendingCount: snapshot.pendingCount, error: null, details: detailPrefix ? `Pulling subjects... (received ${detailPrefix})` : "Pulling subjects..." })
  const customSubjectCount = await pullCustomSubjects(highWaterAt)
  emitStatus({ status: "syncing", pendingCount: snapshot.pendingCount, error: null, details: "Pulling hidden subjects..." })
  const hiddenSubjectCount = await pullHiddenSubjects(highWaterAt)
  emitStatus({ status: "syncing", pendingCount: snapshot.pendingCount, error: null, details: "Pulling timetable config..." })
  const timetableCount = await pullTimetableConfig(highWaterAt)
  emitStatus({ status: "syncing", pendingCount: snapshot.pendingCount, error: null, details: "Pulling user settings..." })
  const userSettingsCount = await pullUserSettings(highWaterAt)

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
    { table: "custom_subjects", pulled: customSubjectCount, pushed: 0, failed: 0 },
    { table: "hidden_subjects", pulled: hiddenSubjectCount, pushed: 0, failed: 0 },
    { table: "timetable_config", pulled: timetableCount, pushed: 0, failed: 0 },
    { table: "user_settings", pulled: userSettingsCount, pushed: 0, failed: 0 },
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

function isTransientSyncError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return (
    error instanceof TypeError ||
    message.includes("load failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network error")
  )
}

const PAGE_SIZE = 1000

async function pullTable<Row extends RemoteRow>(table: SyncTable, highWaterAt: string): Promise<number> {
  if (!supabase) return 0
  const fileName = FILES[table]
  if (!fileName) return 0

  const local = await readJsonArray<Record<string, unknown>>(fileName)
  const meta = await readMeta()
  const allRows = await fetchChangedRows<Row>(table, highWaterAt, meta.lastPulledAt?.[table])
  const allConflicts: SyncConflictItem[] = []
  const merged = mergeRemoteRows(table, local, allRows, {
    changedRowIds: meta.localChangedRowIds ?? {},
    deletedRowIds: meta.deletedRowIds ?? {},
  }, allConflicts)
  await writeJsonArray(fileName, merged)
  emitLocalDataChanged(table)
  if (allConflicts.length > 0) {
    emitStatus({ conflicts: allConflicts })
  }
  await markTablePulled(table, highWaterAt)
  return allRows.length
}

async function fetchChangedRows<Row extends RemoteRow>(table: SyncTable, highWaterAt: string, lastPulledAt?: string): Promise<Row[]> {
  if (!supabase || !currentSession) return []
  const allRows: Row[] = []
  let from = 0
  for (;;) {
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", currentSession.user.id)
      .lte("updated_at", highWaterAt)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (lastPulledAt) query = query.gt("updated_at", lastPulledAt)
    const { data, error } = await query
    if (error) throw error
    const batch = (data ?? []) as Row[]
    allRows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows
}

async function fetchAllRows<Row extends RemoteRow>(table: SyncTable): Promise<Row[]> {
  if (!supabase || !currentSession) return []
  const allRows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", currentSession.user.id)
      .order("updated_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as Row[]
    allRows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return allRows
}

async function markTablePulled(table: SyncTable, highWaterAt: string): Promise<void> {
  await updateMeta((meta) => ({
    ...meta,
    lastPulledAt: { ...(meta.lastPulledAt ?? {}), [table]: highWaterAt },
  }))
}

function mergeRemoteRows(
  table: SyncTable,
  local: Record<string, unknown>[],
  remote: RemoteRow[],
  protectedRows: {
    changedRowIds: Partial<Record<SyncTable, string[]>>
    deletedRowIds: Partial<Record<SyncTable, string[]>>
  } = { changedRowIds: {}, deletedRowIds: {} },
  conflicts?: SyncConflictItem[],
): Record<string, unknown>[] {
  return mergeRemoteRecords({
    table,
    local: local.filter((item): item is Record<string, unknown> & { id: string } => typeof item.id === "string"),
    remote,
    remoteToLocal: (row) => {
      const localRow = remoteToLocal(table, row)
      return localRow
        ? localRow as unknown as Record<string, unknown> & { id: string; updated_at?: string | null; last_modified_device_id?: string | null }
        : null
    },
    currentDeviceId,
    changedRowIds: protectedRows.changedRowIds,
    deletedRowIds: protectedRows.deletedRowIds,
    conflicts,
  })
}

async function pullCustomSubjects(highWaterAt?: string): Promise<number> {
  if (!supabase) return 0
  const table: SyncTable = "custom_subjects"
  const meta = await readMeta()
  const data = highWaterAt
    ? await fetchChangedRows<CustomSubjectRow>(table, highWaterAt, meta.lastPulledAt?.[table])
    : await fetchAllRows<CustomSubjectRow>(table)
  const local = readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY)
  const byKey = new Map(local.map((subject) => [subject.id, subject]))
  data.forEach((row) => {
    if (row.deleted_at) byKey.delete(row.subject_key)
    else byKey.set(row.subject_key, rowToSubject(row))
  })
  localStorage.setItem(CUSTOM_SUBJECTS_KEY, JSON.stringify(Array.from(byKey.values())))
  bustSubjectCache()
  emitLocalDataChanged("custom_subjects")
  if (highWaterAt) await markTablePulled(table, highWaterAt)
  return data.length
}

async function pullHiddenSubjects(highWaterAt?: string): Promise<number> {
  if (!supabase) return 0
  const table: SyncTable = "hidden_subjects"
  const meta = await readMeta()
  const data = highWaterAt
    ? await fetchChangedRows<HiddenSubjectRow>(table, highWaterAt, meta.lastPulledAt?.[table])
    : await fetchAllRows<HiddenSubjectRow>(table)
  const next = new Set(readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY))
  data.forEach((row) => {
    if (row.deleted_at) next.delete(row.subject_id)
    else next.add(row.subject_id)
  })
  localStorage.setItem(HIDDEN_SUBJECTS_KEY, JSON.stringify(Array.from(next)))
  emitLocalDataChanged("hidden_subjects")
  if (highWaterAt) await markTablePulled(table, highWaterAt)
  return data.length
}

async function pullTimetableConfig(highWaterAt?: string): Promise<number> {
  if (!supabase || !currentSession) return 0
  const table: SyncTable = "timetable_config"
  const meta = await readMeta()
  const rows = highWaterAt
    ? await fetchChangedRows<TimetableConfigRow>(table, highWaterAt, meta.lastPulledAt?.[table])
    : await fetchAllRows<TimetableConfigRow>(table)
  const data = rows[0]
  if (data) {
    setTimetableConfig(rowToTimetableConfig(data))
    emitLocalDataChanged("timetable_config")
  }
  if (highWaterAt) await markTablePulled(table, highWaterAt)
  return rows.length
}

async function pullUserSettings(highWaterAt?: string): Promise<number> {
  if (!supabase || !currentSession) return 0
  const table: SyncTable = "user_settings"
  const meta = await readMeta()
  const rows = highWaterAt
    ? await fetchChangedRows<UserSettingsRow>(table, highWaterAt, meta.lastPulledAt?.[table])
    : await fetchAllRows<UserSettingsRow>(table)
  const data = rows[0]
  if (data) {
    const row = data
    const settings = scrubUserSettingsSecrets(rowToUserSettings(row))
    await scrubRemoteUserSettingsSecrets(row)
    if (settings.openrouter_model) setModel(settings.openrouter_model)
    if (settings.reasoning_effort) setReasoningEffort(settings.reasoning_effort as ReasoningEffort)
    setReasoningMaxTokens(settings.reasoning_max_tokens)
    setReasoningExclude(settings.reasoning_exclude)
    if (settings.provider) setProvider(settings.provider)
    if (settings.ollama_base_url) setOllamaBaseUrl(settings.ollama_base_url)
    if (settings.ollama_model) setOllamaModel(settings.ollama_model)
    if (settings.assistant_personality) setAssistantPersonality(settings.assistant_personality as AssistantPersonality)
    setAssistantCustomInstructions(settings.assistant_custom_instructions ?? "")
    const currentNotionSettings = getNotionCalendarSettings()
    setNotionCalendarSettings({
      token: currentNotionSettings.token,
      dataSourceId: settings.notion_data_source_id,
      titleProperty: settings.notion_title_property,
      dateProperty: settings.notion_date_property,
      typeProperty: settings.notion_type_property,
      completedProperty: settings.notion_completed_property,
      subjectProperty: settings.notion_subject_property,
    })
    emitLocalDataChanged("user_settings")
  }
  if (highWaterAt) await markTablePulled(table, highWaterAt)
  return rows.length
}

async function scrubRemoteUserSettingsSecrets(row: UserSettingsRow): Promise<void> {
  if (!supabase || !currentSession || !userSettingsHasSecrets(row.settings)) return
  const nextSettings = scrubUserSettingsSecrets(rowToUserSettings(row))
  const { error } = await supabase
    .from("user_settings")
    .update({
      settings: nextSettings,
      last_modified_device_id: currentDeviceId,
    })
    .eq("user_id", currentSession.user.id)
  if (error) {
    console.warn("[sync] failed to scrub remote user_settings secrets:", getErrorMessage(error))
  }
}

async function enqueueAllLocalRows(force = false): Promise<void> {
  const meta = await readMeta()
  const lastSyncAt = force ? null : meta.lastSuccessfulSyncAt
  const changedTables = force ? {} : (meta.localChangedAt ?? {})
  const changedRowIds = force ? {} : (meta.localChangedRowIds ?? {})
  const deletedRowIds = force ? {} : (meta.deletedRowIds ?? {})
  const needsEventBackfill = !force && shouldBackfillCalendarTable("events", meta.eventsBackfillCompletedAt)
  const needsSessionBackfill = !force && shouldBackfillCalendarTable("study_sessions", meta.sessionsBackfillCompletedAt)

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
    if (shouldEnqueueFileRow("projects", project, changedTables, changedRowIds, lastSyncAt)) {
      await enqueueRemoteUpsert("projects", project)
      projectEnqueued++
    }
  }
  let eventEnqueued = 0
  for (const event of events) {
    if (needsEventBackfill || shouldEnqueueFileRow("events", event, changedTables, changedRowIds, lastSyncAt)) {
      await enqueueRemoteUpsert("events", event)
      eventEnqueued++
    }
  }
  let sessionEnqueued = 0
  for (const session of sessions) {
    if (needsSessionBackfill || shouldEnqueueFileRow("study_sessions", session, changedTables, changedRowIds, lastSyncAt)) {
      await enqueueRemoteUpsert("study_sessions", session)
      sessionEnqueued++
    }
  }
  for (const id of deletedRowIds.projects ?? []) {
    await enqueueRemoteSoftDelete("projects", id)
  }
  for (const id of deletedRowIds.events ?? []) {
    await enqueueRemoteSoftDelete("events", id)
  }
  for (const id of deletedRowIds.study_sessions ?? []) {
    await enqueueRemoteSoftDelete("study_sessions", id)
  }
  let customSubjectEnqueued = 0
  const customSubjects = readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY)
  for (const subject of customSubjects) {
    if (force || !lastSyncAt || isChangedRow(changedRowIds, "custom_subjects", subject.id)) {
      await enqueueRemoteUpsert("custom_subjects", subject)
      customSubjectEnqueued++
    }
  }
  for (const id of deletedRowIds.custom_subjects ?? []) {
    await enqueueRemoteSoftDelete("custom_subjects", id)
  }
  let hiddenSubjectEnqueued = 0
  const hiddenSubjects = readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY)
  for (const subjectId of hiddenSubjects) {
    if (force || !lastSyncAt || isChangedRow(changedRowIds, "hidden_subjects", subjectId)) {
      await enqueueRemoteUpsert("hidden_subjects", subjectId)
      hiddenSubjectEnqueued++
    }
  }
  for (const id of deletedRowIds.hidden_subjects ?? []) {
    await enqueueRemoteSoftDelete("hidden_subjects", id)
  }
  let timetableEnqueued = 0
  const timetableConfig = getTimetableConfig()
  if (force || !lastSyncAt || isChangedRow(changedRowIds, "timetable_config", "timetable_config")) {
    await enqueueRemoteUpsert("timetable_config", timetableConfig)
    timetableEnqueued = 1
  }
  let userSettingsEnqueued = 0
  if (force || !lastSyncAt || isChangedRow(changedRowIds, "user_settings", "user_settings")) {
    const settings = collectUserSettingsForSync()
    await enqueueRemoteUpsert("user_settings", settings)
    userSettingsEnqueued = 1
  }
  console.warn(`[sync] enqueueAllLocalRows: lastSyncAt=${lastSyncAt ?? "null"}, projects=${projects.length}/${projectEnqueued}, events=${events.length}/${eventEnqueued}, sessions=${sessions.length}/${sessionEnqueued}, customSubjects=${customSubjects.length}/${customSubjectEnqueued}, hiddenSubjects=${hiddenSubjects.length}/${hiddenSubjectEnqueued}, timetable=${timetableEnqueued}, userSettings=${userSettingsEnqueued}`)
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
    if (typeof id === "string") {
      await removeLocalRow(change.table, id)
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
  if (table === "user_settings") {
    await pullUserSettings()
    return
  }
  const fileName = FILES[table]
  if (!fileName) return
  const local = await readJsonArray<Record<string, unknown>>(fileName)
  const meta = await readMeta()
  const merged = mergeRemoteRows(table, local, [row], {
    changedRowIds: meta.localChangedRowIds ?? {},
    deletedRowIds: meta.deletedRowIds ?? {},
  })
  await writeJsonArray(fileName, merged)
  emitLocalDataChanged(table)
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
  if (table === "user_settings") {
    // user_settings is single-row, handled by pullUserSettings
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
    case "user_settings":
      return userSettingsToRow(payload as UserSettings, userId, deviceId)
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
    const now = new Date().toISOString()
    await updateMeta((latestMeta) => ({
      ...latestMeta,
      migratedUuidIds: true,
      localChangedAt: changed
        ? { ...(latestMeta.localChangedAt ?? {}), projects: now, events: now, study_sessions: now }
        : latestMeta.localChangedAt,
      localChangedRowIds: changed
        ? {
          ...(latestMeta.localChangedRowIds ?? {}),
          projects: migratedProjects.map((project) => project.id),
          events: migratedEvents.map((event) => event.id),
          study_sessions: migratedSessions.map((session) => session.id),
        }
        : latestMeta.localChangedRowIds,
    }))
  }
}

async function readMeta(): Promise<SyncMeta> {
  const deviceId = currentDeviceId ?? await getDeviceId()
  try {
    const parsed = await readStoredMeta()
    if (!parsed) return { deviceId, lastSuccessfulSyncAt: null }
    const legacyCalendarBackfillCompletedAt = getLegacyCalendarBackfillCompletedAt(parsed)
    return {
      deviceId,
      lastPulledAt: parseTableStringRecord(parsed.lastPulledAt),
      lastSuccessfulSyncAt: parsed.lastSuccessfulSyncAt ?? null,
      migratedUuidIds: parsed.migratedUuidIds,
      eventsBackfillCompletedAt: parsed.eventsBackfillCompletedAt ?? legacyCalendarBackfillCompletedAt,
      sessionsBackfillCompletedAt: parsed.sessionsBackfillCompletedAt ?? legacyCalendarBackfillCompletedAt,
      localChangedAt: parseTableStringRecord(parsed.localChangedAt),
      localChangedRowIds: parseRowIdsByTable(parsed.localChangedRowIds),
      deletedRowIds: parseDeletedRowIds(parsed.deletedRowIds),
    }
  } catch {
    return { deviceId, lastSuccessfulSyncAt: null }
  }
}

async function writeMeta(meta: SyncMeta): Promise<void> {
  await writeStoredMeta(meta)
}

async function updateMeta(update: (meta: SyncMeta) => SyncMeta | Promise<SyncMeta>): Promise<SyncMeta> {
  const result = metaLock.then(async () => {
    const meta = await readMeta()
    const next = await update(meta)
    await writeMeta(next)
    return next
  })
  metaLock = result.catch((e: unknown) => {
    console.error("Failed to update sync metadata:", e)
  })
  return result
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

async function markLocalUpsert(table: SyncTable, payload: LocalRecord): Promise<void> {
  const rowId = getLocalRecordId(table, payload)
  await updateMeta((meta) => ({
    ...meta,
    localChangedAt: { ...(meta.localChangedAt ?? {}), [table]: new Date().toISOString() },
    localChangedRowIds: rowId ? addChangedRowId(meta.localChangedRowIds ?? {}, table, rowId) : meta.localChangedRowIds,
    deletedRowIds: rowId ? removeDeletedRowId(meta.deletedRowIds ?? {}, table, rowId) : meta.deletedRowIds,
  }))
}

async function markLocalDelete(table: SyncTable, rowId: string): Promise<void> {
  await updateMeta((meta) => ({
    ...meta,
    localChangedAt: { ...(meta.localChangedAt ?? {}), [table]: new Date().toISOString() },
    localChangedRowIds: addChangedRowId(meta.localChangedRowIds ?? {}, table, rowId),
    deletedRowIds: addDeletedRowId(meta.deletedRowIds ?? {}, table, rowId),
  }))
}

function parseTableStringRecord(value: unknown): Partial<Record<SyncTable, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const record = value as Partial<Record<SyncTable, unknown>>
  const parsed: Partial<Record<SyncTable, string>> = {}
  for (const table of SYNC_TABLES) {
    if (typeof record[table] === "string") parsed[table] = record[table]
  }
  return parsed
}

function parseRowIdsByTable(value: unknown): Partial<Record<SyncTable, string[]>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const record = value as Partial<Record<SyncTable, unknown>>
  const parsed: Partial<Record<SyncTable, string[]>> = {}
  for (const table of SYNC_TABLES) {
    const ids = record[table]
    if (Array.isArray(ids)) parsed[table] = ids.filter((id): id is string => typeof id === "string")
  }
  return parsed
}

function parseDeletedRowIds(value: unknown): Partial<Record<SyncTable, string[]>> {
  return parseRowIdsByTable(value)
}

function getLocalRecordId(table: SyncTable, payload: LocalRecord): string | null {
  if (table === "custom_subjects") return (payload as Subject).id
  if (table === "hidden_subjects") return payload as string
  if (table === "timetable_config") return "timetable_config"
  if (table === "user_settings") return "user_settings"
  const id = (payload as { id?: unknown }).id
  return typeof id === "string" ? id : null
}

function collectUserSettingsForSync(): UserSettings {
  const notionSettings = getNotionCalendarSettings()
  return {
    openrouter_api_key: "",
    openrouter_model: getModel(),
    reasoning_effort: getReasoningEffort(),
    reasoning_max_tokens: getReasoningMaxTokens(),
    reasoning_exclude: getReasoningExclude(),
    notion_token: "",
    notion_data_source_id: notionSettings.dataSourceId,
    notion_title_property: notionSettings.titleProperty,
    notion_date_property: notionSettings.dateProperty,
    notion_type_property: notionSettings.typeProperty,
    notion_completed_property: notionSettings.completedProperty,
    notion_subject_property: notionSettings.subjectProperty,
    provider: getProvider(),
    ollama_base_url: getOllamaBaseUrl(),
    ollama_model: getOllamaModel(),
    assistant_personality: getAssistantPersonality(),
    assistant_custom_instructions: getAssistantCustomInstructions(),
  }
}

function getLegacyCalendarBackfillCompletedAt(meta: Partial<SyncMeta>): string | null {
  const value = (meta as { calendarBackfillCompletedAt?: unknown }).calendarBackfillCompletedAt
  return typeof value === "string" ? value : null
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
  void pullRemoteChanges()
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
