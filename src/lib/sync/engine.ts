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

let currentSession: Session | null = null
let currentDeviceId: string | null = null
let unsubscribeRealtime: (() => void) | null = null
let flushPromise: Promise<void> | null = null
let snapshot: SyncStatusSnapshot = {
  status: "signed-out",
  pendingCount: 0,
  error: null,
  lastSuccessfulSyncAt: null,
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
  unsubscribeRealtime?.()
  unsubscribeRealtime = null

  if (!session || !supabase) {
    emitStatus({ status: "signed-out", pendingCount: 0, error: null })
    return
  }

  currentDeviceId = await getDeviceId()
  emitStatus({ status: "syncing", error: null })

  await runInitialSync()

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
}

export async function recordLocalUpsert(table: SyncTable, payload: LocalRecord): Promise<void> {
  if (!currentSession || !currentDeviceId) return
  const row = localToRemoteRow(table, payload, currentSession.user.id, currentDeviceId)
  if (!row) return
  const queue = await enqueueSyncItem({
    table,
    operation: "upsert",
    rowId: getQueueRowId(table, payload, row),
    payload: row,
  })
  emitStatus({ status: "pending", pendingCount: queue.length, error: null })
  void flushQueue()
}

export async function recordLocalSoftDelete(table: SyncTable, rowId: string): Promise<void> {
  if (!currentSession || !currentDeviceId) return
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
  emitStatus({ status: "pending", pendingCount: queue.length, error: null })
  void flushQueue()
}

export function getSyncSnapshot(): SyncStatusSnapshot {
  return snapshot
}

async function runInitialSync(): Promise<void> {
  try {
    await migrateLocalIdsToUuids()
    await pullRemoteChanges()
    await enqueueAllLocalRows()
    await flushQueue()
  } catch (e) {
    emitStatus({ status: "error", error: String(e) })
  }
}

async function flushQueue(): Promise<void> {
  if (flushPromise) return flushPromise
  flushPromise = flushQueueInternal().finally(() => {
    flushPromise = null
  })
  return flushPromise
}

async function flushQueueInternal(): Promise<void> {
  if (!currentSession || !supabase) return
  const queue = await readSyncQueue()
  if (queue.length === 0) {
    emitStatus({ status: "synced", pendingCount: 0, error: null, lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt })
    return
  }

  emitStatus({ status: "syncing", pendingCount: queue.length, error: null })

  const remaining: SyncQueueItem[] = []
  for (const item of queue) {
    try {
      await pushQueueItem(supabase, item)
    } catch (e) {
      remaining.push({
        ...item,
        retryCount: item.retryCount + 1,
        lastError: String(e),
      })
    }
  }

  await writeSyncQueue(remaining)
  const now = new Date().toISOString()
  if (remaining.length === 0) {
    const meta = await readMeta()
    await writeMeta({ ...meta, lastSuccessfulSyncAt: now })
    emitStatus({ status: "synced", pendingCount: 0, error: null, lastSuccessfulSyncAt: now })
  } else {
    emitStatus({
      status: "error",
      pendingCount: remaining.length,
      error: remaining[0]?.lastError ?? "Some sync changes failed",
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
  if (error) throw error
}

async function pullRemoteChanges(): Promise<void> {
  if (!currentSession || !supabase) return
  emitStatus({ status: "syncing", error: null })
  await Promise.all([
    pullTable<ProjectRow>("projects"),
    pullTable<EventRow>("events"),
    pullTable<StudySessionRow>("study_sessions"),
    pullCustomSubjects(),
    pullHiddenSubjects(),
    pullTimetableConfig(),
  ])
  const queue = await readSyncQueue()
  emitStatus({
    status: queue.length > 0 ? "pending" : "synced",
    pendingCount: queue.length,
    error: null,
    lastSuccessfulSyncAt: new Date().toISOString(),
  })
}

async function pullTable<Row extends RemoteRow>(table: SyncTable): Promise<void> {
  if (!supabase) return
  const fileName = FILES[table]
  if (!fileName) return
  const { data, error } = await supabase.from(table).select("*")
  if (error) throw error
  const local = await readJsonArray<Record<string, unknown>>(fileName)
  const remote = (data ?? []) as Row[]
  const merged = mergeRemoteRows(table, local, remote)
  await writeJsonArray(fileName, merged)
  emitLocalDataChanged(table)
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
    if (!localItem || compareIso((remoteLocal as { updated_at?: string }).updated_at, localItem.updated_at as string | undefined) >= 0) {
      byId.set(row.id, remoteLocal as unknown as Record<string, unknown>)
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

async function enqueueAllLocalRows(): Promise<void> {
  const [projects, events, sessions] = await Promise.all([
    readJsonArray<Project>("projects.json"),
    readJsonArray<CalendarEvent>("events.json"),
    readJsonArray<StudySession>("sessions.json"),
  ])
  for (const project of projects) await recordLocalUpsert("projects", project)
  for (const event of events) await recordLocalUpsert("events", event)
  for (const session of sessions) await recordLocalUpsert("study_sessions", session)
  for (const subject of readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY)) {
    await recordLocalUpsert("custom_subjects", subject)
  }
  for (const subjectId of readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY)) {
    await recordLocalUpsert("hidden_subjects", subjectId)
  }
  await recordLocalUpsert("timetable_config", getTimetableConfig())
}

async function applyRealtimeChange(change: RealtimeChange): Promise<void> {
  if (!currentDeviceId) return
  const row = change.new ?? change.old
  if (row?.last_modified_device_id === currentDeviceId) return
  if (change.eventType === "DELETE" && change.old?.id) {
    await removeLocalRow(change.table, String(change.old.id))
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

async function removeLocalRow(table: SyncTable, id: string): Promise<void> {
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
  if (meta.migratedUuidIds) return

  const projects = await readJsonArray<Project>("projects.json")
  const projectIdMap = new Map<string, string>()
  const migratedProjects = projects.map((project) => {
    const id = isUuid(project.id) ? project.id : crypto.randomUUID()
    if (id !== project.id) projectIdMap.set(project.id, id)
    return ensureUpdatedAt({ ...project, id })
  })

  const events = await readJsonArray<CalendarEvent>("events.json")
  const migratedEvents = events.map((event) => ensureUpdatedAt({
    ...event,
    id: isUuid(event.id) ? event.id : crypto.randomUUID(),
  }))

  const sessions = await readJsonArray<StudySession>("sessions.json")
  const migratedSessions = sessions.map((session) => ensureUpdatedAt({
    ...session,
    id: isUuid(session.id) ? session.id : crypto.randomUUID(),
    projectId: session.projectId ? (projectIdMap.get(session.projectId) ?? session.projectId) : undefined,
  }))

  await Promise.all([
    writeJsonArray("projects.json", migratedProjects),
    writeJsonArray("events.json", migratedEvents),
    writeJsonArray("sessions.json", migratedSessions),
    writeMeta({ ...meta, migratedUuidIds: true }),
  ])
  emitLocalDataChanged("projects")
  emitLocalDataChanged("events")
  emitLocalDataChanged("study_sessions")
}

async function readMeta(): Promise<SyncMeta> {
  const deviceId = currentDeviceId ?? await getDeviceId()
  try {
    const path = await appDataPath(META_FILE)
    if (!(await exists(path))) return { deviceId }
    const parsed = JSON.parse(await readTextFile(path)) as Partial<SyncMeta>
    return {
      deviceId,
      lastPulledAt: parsed.lastPulledAt,
      lastSuccessfulSyncAt: parsed.lastSuccessfulSyncAt,
      migratedUuidIds: parsed.migratedUuidIds,
    }
  } catch {
    return { deviceId }
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
