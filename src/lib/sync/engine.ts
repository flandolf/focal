import type { RealtimeChannel, Session } from "@supabase/supabase-js"
import { getStoredQuickLinks, QUICK_LINKS_STORAGE_KEY } from "@/lib/quickLinks"
import {
  getAssistantCustomInstructions,
  getAssistantPersonality,
  getModel,
  getNotionCalendarSettings,
  getOllamaBaseUrl,
  getOllamaModel,
  getProvider,
  getReasoningEffort,
  getReasoningExclude,
  getReasoningMaxTokens,
  getTimetableConfig,
  setAssistantCustomInstructions,
  setAssistantPersonality,
  setModel,
  setNotionCalendarSettings,
  setOllamaBaseUrl,
  setOllamaModel,
  setProvider,
  setReasoningEffort,
  setReasoningExclude,
  setReasoningMaxTokens,
  setTimetableConfig,
  type AssistantPersonality,
  type ReasoningEffort,
} from "@/lib/settings"
import { setCachedPreference } from "@/lib/storage/preferences"
import { supabase } from "@/lib/supabase/client"
import { getDeviceId } from "@/lib/sync/device"
import {
  emitLocalDataChanged,
  readLocalDataArray,
  readLocalStorageArray,
  SYNC_DATA_FILES,
  writeLocalDataArray,
} from "@/lib/sync/localData"
import {
  claimUnownedOutbox,
  enqueueChange,
  finishFlush,
  readOutbox,
  readState,
  removeOutboxChange,
  writeState,
} from "@/lib/sync/persistence"
import { isDue, isSyncTable, latestChanges, repairDuplicateSessions, retryChange } from "@/lib/sync/protocol"
import { normalizeStudySession } from "@/lib/studySessions"
import type {
  LocalRecord,
  RemoteSyncChange,
  SyncChange,
  SyncStatusSnapshot,
  SyncTable,
} from "@/lib/sync/types"
import type { CalendarEvent, Project, StudySession, Subject, TimetableConfig, UserSettings } from "@/lib/types"
import { bustSubjectCache, getErrorMessage } from "@/lib/utils"

const CUSTOM_SUBJECTS_KEY = "focal-custom-subjects"
const HIDDEN_SUBJECTS_KEY = "focal-hidden-subjects"
const PAGE_SIZE = 1000
const FLUSH_INTERVAL_MS = 30_000
const PULL_INTERVAL_MS = 120_000
const MAX_RETRIES = 8

let currentSession: Session | null = null
let currentDeviceId: string | null = null
let realtimeChannel: RealtimeChannel | null = null
let flushInterval: ReturnType<typeof setInterval> | null = null
let pullInterval: ReturnType<typeof setInterval> | null = null
let flushPromise: Promise<void> | null = null
let pullPromise: Promise<void> | null = null
let pullQueued = false
let syncEpoch = 0

let snapshot: SyncStatusSnapshot = {
  status: "signed-out",
  pendingCount: 0,
  error: null,
  lastSuccessfulSyncAt: null,
  details: null,
  tableStats: null,
  failedItems: null,
  conflicts: null,
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
}

const listeners = new Set<(status: SyncStatusSnapshot) => void>()

function emitStatus(update: Partial<SyncStatusSnapshot>): void {
  snapshot = { ...snapshot, ...update }
  listeners.forEach((listener) => listener(snapshot))
}

export function subscribeSyncStatus(listener: (status: SyncStatusSnapshot) => void): () => void {
  listeners.add(listener)
  listener(snapshot)
  return () => listeners.delete(listener)
}

export async function setSyncSession(session: Session | null): Promise<void> {
  const epoch = ++syncEpoch
  currentSession = session
  await stopRemoteSync()
  if (epoch !== syncEpoch) return

  if (!session || !supabase) {
    emitStatus({
      status: "signed-out",
      pendingCount: (await readOutbox("")).length,
      error: null,
      details: null,
      tableStats: null,
      failedItems: null,
      conflicts: null,
    })
    return
  }

  currentDeviceId = await getDeviceId()
  if (epoch !== syncEpoch) return
  await claimUnownedOutbox(session.user.id)
  if (epoch !== syncEpoch) return
  emitStatus({ status: "syncing", error: null, details: "Repairing local data…" })

  try {
    await repairLocalSessionDuplicates(session.user.id)
    if (epoch !== syncEpoch) return
    // Pull first so a new device cannot publish empty/default singleton state
    // over an account that already has data.
    await pullRemoteChanges()
    if (epoch !== syncEpoch) return
    await bootstrapLocalState(session.user.id, epoch)
    if (epoch !== syncEpoch) return
    await flushQueue()
    if (epoch !== syncEpoch) return
    await pullRemoteChanges()
    if (epoch !== syncEpoch) return
    await repairLocalSessionDuplicates(session.user.id)
    if (epoch !== syncEpoch) return
    await flushQueue()
    if (epoch !== syncEpoch) return
    subscribeRealtime(session.user.id)
    flushInterval = setInterval(() => void flushQueue(), FLUSH_INTERVAL_MS)
    pullInterval = setInterval(() => void pullRemoteChanges(), PULL_INTERVAL_MS)
  } catch (error) {
    if (epoch !== syncEpoch) return
    const message = syncErrorMessage(error)
    emitStatus({ status: "error", error: message, details: message })
  }
}

async function stopRemoteSync(): Promise<void> {
  if (flushInterval) clearInterval(flushInterval)
  if (pullInterval) clearInterval(pullInterval)
  flushInterval = null
  pullInterval = null
  const channel = realtimeChannel
  realtimeChannel = null
  if (channel && supabase) await supabase.removeChannel(channel)
}

export async function recordLocalUpsert(
  table: SyncTable,
  payload: LocalRecord,
  accountId = currentSession?.user.id ?? "",
): Promise<void> {
  const rowId = localRowId(table, payload)
  const queue = await enqueueChange(accountId, table, rowId, "put", sanitizePayload(table, payload))
  emitQueuedStatus(queue, `${table.replace(/_/g, " ")} saved locally`)
  if (currentSession) void flushQueue()
}

export async function recordLocalSoftDelete(
  table: SyncTable,
  rowId: string,
  accountId = currentSession?.user.id ?? "",
): Promise<void> {
  const queue = await enqueueChange(accountId, table, rowId, "delete", null)
  emitQueuedStatus(queue, `${table.replace(/_/g, " ")} deletion saved locally`)
  if (currentSession) void flushQueue()
}

function emitQueuedStatus(queue: SyncChange[], details: string): void {
  emitStatus({
    status: currentSession ? "pending" : "signed-out",
    pendingCount: queue.length,
    error: null,
    details,
  })
}

export function notifyUserSettingsChanged(): void {
  void recordLocalUpsert("user_settings", collectUserSettings())
}

export async function rememberDuplicateNotionPages(pageIds: readonly string[]): Promise<void> {
  if (pageIds.length === 0) return
  const existing = await readState<string[]>("notion:duplicate-pages") ?? []
  await writeState("notion:duplicate-pages", [...new Set([...existing, ...pageIds])])
}

export async function retrySync(): Promise<void> {
  if (!currentSession) return
  emitStatus({ status: "syncing", error: null, details: "Retrying sync…" })
  await flushQueue()
  await pullRemoteChanges()
}

export async function pullNow(): Promise<void> {
  if (!currentSession) return emitStatus({ status: "error", error: "Not signed in", details: "Sign in to pull changes" })
  await pullRemoteChanges()
}

export async function pushNow(): Promise<void> {
  if (!currentSession) return emitStatus({ status: "error", error: "Not signed in", details: "Sign in to push changes" })
  await flushQueue()
}

export async function forcePushAndMerge(): Promise<void> {
  await enqueueAllLocalData()
  await flushQueue()
  await pullRemoteChanges()
}

export async function forcePushAndOverwrite(): Promise<void> {
  await enqueueMissingRemoteDeletes()
  await enqueueAllLocalData()
  await flushQueue()
}

export function clearFailedItems(): void {
  emitStatus({ failedItems: null, error: null })
}

export async function retryFailedItem(table: SyncTable, rowId: string): Promise<void> {
  const value = await readCurrentLocalValue(table, rowId)
  if (value === undefined) await recordLocalSoftDelete(table, rowId)
  else await recordLocalUpsert(table, value)
}

export async function dropQueueItem(table: SyncTable, rowId: string): Promise<void> {
  await removeOutboxChange(currentSession?.user.id ?? "", table, rowId)
  const queue = await readOutbox(currentSession?.user.id ?? "")
  emitStatus({ pendingCount: queue.length, failedItems: snapshot.failedItems?.filter((item) => item.table !== table || item.rowId !== rowId) ?? null })
}

export async function resolveConflictAcceptRemote(_table?: SyncTable, _rowId?: string): Promise<void> {
  await pullRemoteChanges()
}

export async function resolveConflictKeepLocal(table: SyncTable, rowId: string): Promise<void> {
  await retryFailedItem(table, rowId)
}

export function dismissConflict(_table?: SyncTable, _rowId?: string): void {
  emitStatus({ conflicts: null })
}

export function clearConflicts(): void {
  emitStatus({ conflicts: null })
}

async function bootstrapLocalState(accountId: string, epoch: number): Promise<void> {
  const key = `bootstrap:${accountId}:change-log-v1`
  if (await readState<boolean>(key)) return
  if (epoch !== syncEpoch) return
  emitStatus({ status: "syncing", details: "Preparing the first clean sync…" })
  await enqueueAllLocalData(accountId, epoch)
  if (epoch !== syncEpoch) return
  await writeState(key, true)
}

async function enqueueAllLocalData(accountId = currentSession?.user.id ?? "", epoch = syncEpoch): Promise<void> {
  const [projects, events, sessions] = await Promise.all([
    readLocalDataArray<Project>("projects.json"),
    readLocalDataArray<CalendarEvent>("events.json"),
    readLocalDataArray<StudySession>("sessions.json"),
  ])
  if (epoch !== syncEpoch) return
  const pendingDeletes = new Set((await readOutbox(accountId))
    .filter((change) => change.operation === "delete")
    .map((change) => `${change.entity}:${change.rowId}`))
  for (const project of projects) {
    if (epoch !== syncEpoch) return
    if (!pendingDeletes.has(`projects:${project.id}`)) await recordLocalUpsert("projects", project, accountId)
  }
  for (const event of events) {
    if (epoch !== syncEpoch) return
    if (!pendingDeletes.has(`events:${event.id}`)) await recordLocalUpsert("events", event, accountId)
  }
  for (const session of sessions) {
    if (epoch !== syncEpoch) return
    if (!pendingDeletes.has(`study_sessions:${session.id}`)) {
      await recordLocalUpsert("study_sessions", normalizeStudySession(session), accountId)
    }
  }
  for (const subject of readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY)) await recordLocalUpsert("custom_subjects", subject, accountId)
  for (const subjectId of readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY)) await recordLocalUpsert("hidden_subjects", subjectId, accountId)
  await recordLocalUpsert("timetable_config", getTimetableConfig(), accountId)
  await recordLocalUpsert("user_settings", collectUserSettings(), accountId)
}

async function repairLocalSessionDuplicates(accountId = currentSession?.user.id ?? ""): Promise<void> {
  const raw = await readLocalDataArray<unknown>("sessions.json")
  const repair = repairDuplicateSessions(raw)
  if (repair.duplicateIds.length === 0) return

  await writeLocalDataArray("sessions.json", repair.sessions)
  for (const id of repair.duplicateIds) await recordLocalSoftDelete("study_sessions", id, accountId)
  await rememberDuplicateNotionPages(repair.duplicateNotionPageIds)
  emitLocalDataChanged("study_sessions")
  emitStatus({
    status: currentSession ? "pending" : "signed-out",
    details: `Removed ${repair.duplicateIds.length} duplicate study session${repair.duplicateIds.length === 1 ? "" : "s"}`,
  })
}

async function flushQueue(): Promise<void> {
  if (flushPromise) return flushPromise
  flushPromise = flushQueueInternal().finally(() => { flushPromise = null })
  return flushPromise
}

async function flushQueueInternal(): Promise<void> {
  const session = currentSession
  const deviceId = currentDeviceId
  const epoch = syncEpoch
  if (!session || !deviceId || !supabase) return
  const queue = await readOutbox(session.user.id)
  if (epoch !== syncEpoch) return
  const now = new Date().toISOString()
  const due = queue.filter((change) => isDue(change, now))
  if (due.length === 0) {
    emitStatus({
      status: queue.length === 0 ? "synced" : "pending",
      pendingCount: queue.length,
      error: null,
      details: queue.length === 0 ? "All changes synced" : `${queue.length} change${queue.length === 1 ? "" : "s"} waiting to retry`,
    })
    return
  }

  emitStatus({ status: "syncing", pendingCount: queue.length, error: null, details: `Pushing ${due.length} change${due.length === 1 ? "" : "s"}…` })
  const rows = due.map((change) => ({
    user_id: session.user.id,
    change_id: change.changeId,
    device_id: deviceId,
    entity: change.entity,
    row_id: change.rowId,
    operation: change.operation,
    payload: change.payload,
  }))
  const processedIds = due.map((change) => change.changeId)

  const { data, error } = await supabase
    .from("sync_changes")
    .upsert(rows, { onConflict: "user_id,change_id", ignoreDuplicates: true })
    .select("change_id")

  if (error) {
    const retries = due.map((change) => retryChange(change, getErrorMessage(error), now))
    const next = await finishFlush(session.user.id, [], retries)
    const exhausted = retries.filter((change) => change.retryCount >= MAX_RETRIES)
    if (epoch !== syncEpoch) return
    emitStatus({
      status: "error",
      pendingCount: next.length,
      error: getErrorMessage(error),
      details: `${next.length} change${next.length === 1 ? "" : "s"} retained for retry`,
      failedItems: exhausted.map((change) => ({ table: change.entity, rowId: change.rowId, error: change.lastError ?? "Sync failed" })),
      isOnline: !isNetworkError(error),
    })
    return
  }

  void data
  // ignoreDuplicates returns no row for an already accepted id, which is still success.
  const next = await finishFlush(session.user.id, processedIds, [])
  if (epoch !== syncEpoch) return
  const syncedAt = new Date().toISOString()
  emitStatus({
    status: next.length === 0 ? "synced" : "pending",
    pendingCount: next.length,
    error: null,
    lastSuccessfulSyncAt: syncedAt,
    details: `Synced ${due.length} change${due.length === 1 ? "" : "s"}`,
    tableStats: statsFor(due, "pushed"),
    failedItems: null,
    isOnline: true,
  })
}

async function pullRemoteChanges(): Promise<void> {
  if (pullPromise) {
    pullQueued = true
    return pullPromise
  }
  pullPromise = pullRemoteChangesInternal().finally(() => {
    pullPromise = null
    if (pullQueued) {
      pullQueued = false
      void pullRemoteChanges()
    }
  })
  return pullPromise
}

async function pullRemoteChangesInternal(): Promise<void> {
  const session = currentSession
  const epoch = syncEpoch
  if (!session || !supabase) return
  emitStatus({ status: "syncing", error: null, details: "Pulling remote changes…" })
  const cursorKey = `cursor:${session.user.id}:change-log-v1`
  let cursor = await readState<number>(cursorKey) ?? 0
  const received: RemoteSyncChange[] = []

  for (;;) {
    const { data, error } = await supabase
      .from("sync_changes")
      .select("user_id,change_id,device_id,entity,row_id,operation,payload,revision,created_at")
      .eq("user_id", session.user.id)
      .gt("revision", cursor)
      .order("revision", { ascending: true })
      .limit(PAGE_SIZE)
    if (error) throw error
    if (epoch !== syncEpoch) return
    const batch = (data ?? []).flatMap(parseRemoteChange)
    received.push(...batch)
    if (batch.length > 0) cursor = batch[batch.length - 1].revision
    if ((data ?? []).length < PAGE_SIZE) break
  }

  if (received.length > 0) {
    await applyRemoteChanges(latestChanges(received), session.user.id)
    if (epoch !== syncEpoch) return
    await writeState(cursorKey, cursor)
  }
  const queue = await readOutbox(session.user.id)
  emitStatus({
    status: queue.length === 0 ? "synced" : "pending",
    pendingCount: queue.length,
    error: null,
    lastSuccessfulSyncAt: new Date().toISOString(),
    details: received.length === 0 ? "Remote data is current" : `Pulled ${received.length} change${received.length === 1 ? "" : "s"}`,
    tableStats: statsFor(received.map(remoteToLocalChange), "pulled"),
    isOnline: true,
  })
}

async function applyRemoteChanges(changes: RemoteSyncChange[], accountId: string): Promise<void> {
  const pending = new Set((await readOutbox(accountId)).map((change) => `${change.entity}:${change.rowId}`))
  const applicable = changes.filter((change) => !pending.has(`${change.entity}:${change.row_id}`))

  for (const table of ["projects", "events", "study_sessions"] as const) {
    const tableChanges = applicable.filter((change) => change.entity === table)
    if (tableChanges.length === 0) continue
    const fileName = SYNC_DATA_FILES[table]!
    const local = await readLocalDataArray<Record<string, unknown>>(fileName)
    const byId = new Map(local.map((record) => [String(record.id), record]))
    for (const change of tableChanges) {
      if (change.operation === "delete") byId.delete(change.row_id)
      else if (isObject(change.payload)) {
        const payload = { ...change.payload, id: change.row_id }
        byId.set(change.row_id, table === "study_sessions" ? normalizeStudySession(payload) as unknown as Record<string, unknown> : payload)
      }
    }
    await writeLocalDataArray(fileName, [...byId.values()])
    emitLocalDataChanged(table)
  }

  applyCustomSubjectChanges(applicable.filter((change) => change.entity === "custom_subjects"))
  applyHiddenSubjectChanges(applicable.filter((change) => change.entity === "hidden_subjects"))

  const timetableChanges = applicable.filter((change) => change.entity === "timetable_config")
  const timetable = timetableChanges[timetableChanges.length - 1]
  if (timetable?.operation === "put" && isObject(timetable.payload)) {
    setTimetableConfig(timetable.payload as unknown as TimetableConfig)
    emitLocalDataChanged("timetable_config")
  }

  const settingChanges = applicable.filter((change) => change.entity === "user_settings")
  const settings = settingChanges[settingChanges.length - 1]
  if (settings?.operation === "put" && isObject(settings.payload)) {
    applyUserSettings(settings.payload as unknown as UserSettings)
    emitLocalDataChanged("user_settings")
  }
}

function applyCustomSubjectChanges(changes: RemoteSyncChange[]): void {
  if (changes.length === 0) return
  const byId = new Map(readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY).map((subject) => [subject.id, subject]))
  for (const change of changes) {
    if (change.operation === "delete") byId.delete(change.row_id)
    else if (isSubject(change.payload)) byId.set(change.row_id, { ...change.payload, id: change.row_id })
  }
  setCachedPreference(CUSTOM_SUBJECTS_KEY, JSON.stringify([...byId.values()]), true)
  bustSubjectCache()
  emitLocalDataChanged("custom_subjects")
}

function applyHiddenSubjectChanges(changes: RemoteSyncChange[]): void {
  if (changes.length === 0) return
  const ids = new Set(readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY))
  for (const change of changes) {
    if (change.operation === "delete") ids.delete(change.row_id)
    else ids.add(change.row_id)
  }
  setCachedPreference(HIDDEN_SUBJECTS_KEY, JSON.stringify([...ids]), true)
  emitLocalDataChanged("hidden_subjects")
}

function subscribeRealtime(userId: string): void {
  if (!supabase) return
  realtimeChannel = supabase
    .channel(`focal-change-log-${userId}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "sync_changes",
      filter: `user_id=eq.${userId}`,
    }, () => void pullRemoteChanges())
    .subscribe((status) => {
      const statusText = String(status)
      if (statusText === "CHANNEL_ERROR" || statusText === "TIMED_OUT") void pullRemoteChanges()
    })
}

async function enqueueMissingRemoteDeletes(): Promise<void> {
  const session = currentSession
  const epoch = syncEpoch
  if (!session || !supabase) return
  const { data, error } = await supabase
    .from("sync_changes")
    .select("user_id,change_id,device_id,entity,row_id,operation,payload,revision,created_at")
    .eq("user_id", session.user.id)
    .order("revision", { ascending: true })
  if (error) throw error
  if (epoch !== syncEpoch) return
  const remote = latestChanges((data ?? []).flatMap(parseRemoteChange))
  for (const change of remote) {
    if (change.operation === "delete") continue
    if (await readCurrentLocalValue(change.entity, change.row_id) === undefined) {
      if (epoch !== syncEpoch) return
      await recordLocalSoftDelete(change.entity, change.row_id, session.user.id)
    }
  }
}

async function readCurrentLocalValue(table: SyncTable, rowId: string): Promise<LocalRecord | undefined> {
  const fileName = SYNC_DATA_FILES[table]
  if (fileName) return (await readLocalDataArray<LocalRecord & { id?: string }>(fileName)).find((record) => record.id === rowId)
  if (table === "custom_subjects") return readLocalStorageArray<Subject>(CUSTOM_SUBJECTS_KEY).find((subject) => subject.id === rowId)
  if (table === "hidden_subjects") return readLocalStorageArray<string>(HIDDEN_SUBJECTS_KEY).includes(rowId) ? rowId : undefined
  if (table === "timetable_config") return getTimetableConfig()
  if (table === "user_settings") return collectUserSettings()
}

function collectUserSettings(): UserSettings {
  const notion = getNotionCalendarSettings()
  return {
    openrouter_api_key: "",
    openrouter_model: getModel(),
    reasoning_effort: getReasoningEffort(),
    reasoning_max_tokens: getReasoningMaxTokens(),
    reasoning_exclude: getReasoningExclude(),
    notion_token: "",
    notion_data_source_id: notion.dataSourceId,
    notion_title_property: notion.titleProperty,
    notion_date_property: notion.dateProperty,
    notion_type_property: notion.typeProperty,
    notion_completed_property: notion.completedProperty,
    notion_subject_property: notion.subjectProperty,
    provider: getProvider(),
    ollama_base_url: getOllamaBaseUrl(),
    ollama_model: getOllamaModel(),
    assistant_personality: getAssistantPersonality(),
    assistant_custom_instructions: getAssistantCustomInstructions(),
    quick_links: getStoredQuickLinks(),
  }
}

function applyUserSettings(settings: UserSettings): void {
  if (settings.openrouter_model) setModel(settings.openrouter_model)
  if (settings.reasoning_effort) setReasoningEffort(settings.reasoning_effort as ReasoningEffort)
  if (typeof settings.reasoning_max_tokens === "number") setReasoningMaxTokens(settings.reasoning_max_tokens)
  setReasoningExclude(Boolean(settings.reasoning_exclude))
  if (settings.provider) setProvider(settings.provider)
  if (settings.ollama_base_url) setOllamaBaseUrl(settings.ollama_base_url)
  if (settings.ollama_model) setOllamaModel(settings.ollama_model)
  if (settings.assistant_personality) setAssistantPersonality(settings.assistant_personality as AssistantPersonality)
  setAssistantCustomInstructions(settings.assistant_custom_instructions ?? "")
  if (settings.quick_links) setCachedPreference(QUICK_LINKS_STORAGE_KEY, JSON.stringify(settings.quick_links), true)
  const currentNotion = getNotionCalendarSettings()
  setNotionCalendarSettings({
    token: currentNotion.token,
    dataSourceId: settings.notion_data_source_id ?? "",
    titleProperty: settings.notion_title_property ?? "Name",
    dateProperty: settings.notion_date_property ?? "Date",
    typeProperty: settings.notion_type_property ?? "Type",
    completedProperty: settings.notion_completed_property ?? "Complete",
    subjectProperty: settings.notion_subject_property ?? "Subject",
  })
}

function localRowId(table: SyncTable, payload: LocalRecord): string {
  if (table === "custom_subjects") return (payload as Subject).id
  if (table === "hidden_subjects") return payload as string
  if (table === "timetable_config") return "timetable_config"
  if (table === "user_settings") return "user_settings"
  const id = (payload as { id?: unknown }).id
  if (typeof id !== "string" || id.length === 0) throw new Error(`${table} record is missing an id`)
  return id
}

function sanitizePayload(table: SyncTable, payload: LocalRecord): unknown {
  if (table === "user_settings") return { ...(payload as UserSettings), openrouter_api_key: "", notion_token: "" }
  return JSON.parse(JSON.stringify(payload)) as unknown
}

function parseRemoteChange(value: unknown): RemoteSyncChange[] {
  if (!isObject(value) || !isSyncTable(value.entity)) return []
  if (value.operation !== "put" && value.operation !== "delete") return []
  if (typeof value.change_id !== "string" || typeof value.device_id !== "string" || typeof value.row_id !== "string") return []
  if (typeof value.revision !== "number" || !Number.isSafeInteger(value.revision)) return []
  if (value.operation === "put" && value.payload == null) return []
  return [value as unknown as RemoteSyncChange]
}

function remoteToLocalChange(change: RemoteSyncChange): SyncChange {
  return {
    changeId: change.change_id,
    entity: change.entity,
    rowId: change.row_id,
    operation: change.operation,
    payload: change.payload,
    createdAt: change.created_at,
    retryCount: 0,
  }
}

function statsFor(changes: SyncChange[], field: "pushed" | "pulled"): SyncStatusSnapshot["tableStats"] {
  const counts = new Map<SyncTable, number>()
  for (const change of changes) counts.set(change.entity, (counts.get(change.entity) ?? 0) + 1)
  return [...counts].map(([table, count]) => ({ table, [field]: count, failed: 0 }))
}

function syncErrorMessage(error: unknown): string {
  const message = getErrorMessage(error)
  if (message.includes("sync_changes") || message.includes("schema cache") || message.includes("PGRST205")) {
    return "Supabase sync v2 is not installed. Run supabase/migrations/0004_rebuild_sync_as_change_log.sql."
  }
  return message
}

function isNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return error instanceof TypeError || message.includes("failed to fetch") || message.includes("network")
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isSubject(value: unknown): value is Subject {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.shortCode === "string"
    && typeof value.color === "string"
}
