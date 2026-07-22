import { useState, useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { getNotionCalendarSettings } from "@/lib/settings"
import { syncNotionCalendar, pushEventToNotion, pushSessionToNotion, type NotionCalendarSyncResult } from "@/lib/notion"
import type { CalendarEvent, StudySession, StudySessionDraft, Subject } from "@/lib/types"
import type { NotionConflict } from "@/components/NotionConflictDialog"
import { clearNotionIntent } from "@/lib/notion/outbox"

interface UseNotionSyncOptions {
  events: CalendarEvent[]
  sessions: StudySession[]
  allSubjects: Subject[]
  syncEvents: (created: (Omit<CalendarEvent, "id" | "created_at"> & { id?: string })[], updated: { id: string; updates: Partial<Omit<CalendarEvent, "id" | "created_at">> }[]) => Promise<CalendarEvent[]>
  syncSessions: (created: StudySessionDraft[], updated: { id: string; updates: Partial<Omit<StudySession, "id" | "created_at">> }[]) => Promise<StudySession[]>
}

export function notionEditedTimeLabel(value?: string): string {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : "unknown"
}

export function notionSyncSettledState(succeeded: boolean, now = Date.now()) {
  return succeeded
    ? { status: "success" as const, lastSyncTime: now }
    : { status: "error" as const }
}

export function notionSyncResultSucceeded(result: Pick<NotionCalendarSyncResult, "pushErrors" | "conflicts">): boolean {
  return result.pushErrors.length === 0 && result.conflicts === 0
}

export function retainFailedNotionConflicts<T extends { id: string }>(
  conflicts: T[],
  failedIds: ReadonlySet<string>,
): T[] {
  return conflicts.filter((conflict) => failedIds.has(conflict.id))
}

export function useNotionSync({ events, sessions, allSubjects, syncEvents, syncSessions }: UseNotionSyncOptions) {
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error" | "success">("idle")
  const [lastSyncTime, setLastSyncTime] = useState(0)
  const [notionConflicts, setNotionConflicts] = useState<NotionConflict[]>([])
  const [notionConflictDialogOpen, setNotionConflictDialogOpen] = useState(false)

  const notionSyncInFlightRef = useRef(false)
  const notionSyncQueuedRef = useRef(false)
  const notionSyncQueuedNotifyRef = useRef(false)
  const notionSyncQueuedResolversRef = useRef<{
    resolve: (value: NotionCalendarSyncResult | null) => void
    reject: (reason: unknown) => void
  }[]>([])
  const notionSyncRunnerRef = useRef<((notify: boolean, onProgress?: (msg: string) => void) => Promise<NotionCalendarSyncResult | null>) | null>(null)
  const eventsRef = useRef(events)
  const sessionsRef = useRef(sessions)
  const allSubjectsRef = useRef(allSubjects)

  // Debounce rapid sync requests into a single batched call
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingNotifyRef = useRef(false)

  useEffect(() => {
    eventsRef.current = events
    sessionsRef.current = sessions
    allSubjectsRef.current = allSubjects
  })

  const performNotionSync = useCallback(async (notify: boolean, onProgress?: (msg: string) => void, changedEventIds?: Set<string>, changedSessionIds?: Set<string>) => {
    const settings = getNotionCalendarSettings()
    if (!settings.token.trim() || !settings.dataSourceId.trim()) return null
    if (notionSyncInFlightRef.current) {
      notionSyncQueuedRef.current = true
      notionSyncQueuedNotifyRef.current = notionSyncQueuedNotifyRef.current || notify
      if (notify) {
        return new Promise<NotionCalendarSyncResult | null>((resolve, reject) => {
          notionSyncQueuedResolversRef.current.push({ resolve, reject })
        })
      }
      return null
    }

    notionSyncInFlightRef.current = true
    notionSyncQueuedRef.current = false
    setSyncStatus("syncing")
    let succeeded = false
    try {
      const result = await syncNotionCalendar(settings, eventsRef.current, sessionsRef.current, allSubjectsRef.current, onProgress, changedEventIds, changedSessionIds)
      if (result.created.length > 0 || result.updated.length > 0) {
        const created = await syncEvents(result.created, result.updated)
        const updates = new Map(result.updated.map((item) => [item.id, item.updates]))
        eventsRef.current = [
          ...eventsRef.current.map((event) => updates.has(event.id) ? { ...event, ...updates.get(event.id) } : event),
          ...created,
        ]
      }
      if (result.createdSessions.length > 0 || result.updatedSessions.length > 0) {
        const created = await syncSessions(result.createdSessions, result.updatedSessions)
        const updates = new Map(result.updatedSessions.map((item) => [item.id, item.updates]))
        sessionsRef.current = [
          ...sessionsRef.current.map((session) => updates.has(session.id) ? { ...session, ...updates.get(session.id) } : session),
          ...created,
        ]
      }
      await Promise.all([
        ...result.acknowledgedEventIds.map((id) => clearNotionIntent(settings.dataSourceId, "event", id, "upsert")),
        ...result.acknowledgedSessionIds.map((id) => clearNotionIntent(settings.dataSourceId, "session", id, "upsert")),
      ])
      const syncSucceeded = notionSyncResultSucceeded(result)
      if (result.conflicts > 0 && result.conflictItems.length > 0) {
        const conflicts: NotionConflict[] = result.conflictItems.map((item, i) => {
          const remoteUpdates = item.remoteUpdates as Record<string, unknown>
          return {
            id: `conflict-${i}`,
            type: item.kind,
            title: item.title,
            localId: item.localId,
            notionPageId: item.notionPageId,
            localVersion: {
              title: item.title,
              startTime: item.startTime,
              endTime: item.endTime,
            },
            notionVersion: {
              title: typeof remoteUpdates.title === "string"
                ? remoteUpdates.title
                : `Notion version (last edited ${notionEditedTimeLabel(item.notionLastEditedTime)})`,
              startTime: typeof remoteUpdates.startTime === "string" ? remoteUpdates.startTime : undefined,
              endTime: typeof remoteUpdates.endTime === "string" ? remoteUpdates.endTime : undefined,
              status: typeof remoteUpdates.status === "string" ? remoteUpdates.status : undefined,
              url: item.notionUrl,
            },
            remoteUpdates,
          }
        })
        setNotionConflicts(conflicts)
        setNotionConflictDialogOpen(true)
      }

      if (notify) {
        const pulled = result.created.length + result.updated.length + result.createdSessions.length + result.updatedSessions.length
        const pushed = result.pushedCreated + result.pushedUpdated
        const parts: string[] = []
        if (pulled > 0) parts.push(`${pulled} pulled`)
        if (pushed > 0) parts.push(`${pushed} pushed`)
        if (result.deleted > 0) parts.push(`${result.deleted} deleted`)
        if (syncSucceeded) {
          toast.success(
            parts.length > 0
              ? `Synced Notion items: ${parts.join(", ")}`
              : "Notion items already up to date",
          )
        }
        if (result.skipped > 0) {
          toast.info(`${result.skipped} Notion item${result.skipped === 1 ? "" : "s"} skipped without a valid date`, {
            description: result.skippedReasons[0],
          })
        }
        if (result.pushErrors.length > 0) {
          toast.error(`${result.pushErrors.length} push error${result.pushErrors.length === 1 ? "" : "s"}`, {
            description: result.pushErrors[0],
          })
        }
      }
      succeeded = syncSucceeded
      return notify ? result : null
    } catch (e) {
      if (notify) {
        toast.error(`Notion sync failed: ${String(e)}`)
        throw e
      }
      console.error(`Notion sync failed: ${String(e)}`)
      return null
    } finally {
      const settled = notionSyncSettledState(succeeded)
      setSyncStatus(settled.status)
      if (settled.status === "success") {
        setLastSyncTime(settled.lastSyncTime)
        setTimeout(() => setSyncStatus((status) => status === "success" ? "idle" : status), 2000)
      }
      notionSyncInFlightRef.current = false
      if (notionSyncQueuedRef.current) {
        notionSyncQueuedRef.current = false
        const queuedNotify = notionSyncQueuedNotifyRef.current
        notionSyncQueuedNotifyRef.current = false
        const queuedResolvers = notionSyncQueuedResolversRef.current.splice(0)
        const result = notionSyncRunnerRef.current?.(queuedNotify)
        if (result) {
          result.then(
            (syncResult) => queuedResolvers.forEach(({ resolve }) => resolve(syncResult)),
            (error) => queuedResolvers.forEach(({ reject }) => reject(error)),
          )
        } else {
          queuedResolvers.forEach(({ resolve }) => resolve(null))
        }
      }
    }
    return null
  }, [syncEvents, syncSessions])

  useEffect(() => {
    notionSyncRunnerRef.current = performNotionSync
  }, [performNotionSync])

  const requestNotionSync = useCallback((notify = false) => {
    const settings = getNotionCalendarSettings()
    if (!settings.token.trim() || !settings.dataSourceId.trim()) return
    if (notionSyncInFlightRef.current) {
      notionSyncQueuedRef.current = true
      notionSyncQueuedNotifyRef.current = notionSyncQueuedNotifyRef.current || notify
      return
    }
    // Debounce: collect rapid fire calls into one batched sync
    pendingNotifyRef.current = pendingNotifyRef.current || notify
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      const notifyNow = pendingNotifyRef.current
      pendingNotifyRef.current = false
      void performNotionSync(notifyNow).catch(() => undefined)
    }, 500)
  }, [performNotionSync])

  const pushEventChange = useCallback((_event: CalendarEvent) => {
    requestNotionSync(false)
  }, [requestNotionSync])

  const pushSessionChange = useCallback((_session: StudySession) => {
    requestNotionSync(false)
  }, [requestNotionSync])

  const resolveConflicts = useCallback(async (resolutions: Record<string, "local" | "notion" | "skip">) => {
    const settings = getNotionCalendarSettings()
    if (!settings.token.trim() || !settings.dataSourceId.trim()) return

    const localResolutions: string[] = []
    const notionResolutions: string[] = []
    const pendingNotionResolutions: NotionConflict[] = []
    const skipped: string[] = []
    const failedResolutionIds = new Set<string>()

    for (const conflict of notionConflicts) {
      const resolution = resolutions[conflict.id]
      if (!resolution || resolution === "skip") {
        skipped.push(conflict.title)
        continue
      }

      if (resolution === "local") {
        // Force-push local version to Notion
        try {
          if (conflict.type === "event") {
            const event = eventsRef.current.find((e) => e.id === conflict.localId)
            if (!event) throw new Error("Local event no longer exists")
            const result = await pushEventToNotion(settings, {
              ...event,
              source: {
                ...event.source,
                type: "notion",
                id: conflict.notionPageId,
                kind: "event",
              },
            }, allSubjectsRef.current)
            if (!result) throw new Error("Notion did not accept the event")
            await syncEvents([], [{ id: event.id, updates: { source: result.source } }])
            await clearNotionIntent(settings.dataSourceId, "event", event.id, "upsert")
          } else {
            const session = sessionsRef.current.find((s) => s.id === conflict.localId)
            if (!session) throw new Error("Local study session no longer exists")
            const result = await pushSessionToNotion(settings, {
              ...session,
              source: {
                ...session.source,
                type: "notion",
                id: conflict.notionPageId,
                kind: "session",
              },
            }, allSubjectsRef.current)
            if (!result) throw new Error("Notion did not accept the study session")
            await syncSessions([], [{ id: session.id, updates: { source: result.source } }])
            await clearNotionIntent(settings.dataSourceId, "session", session.id, "upsert")
          }
          localResolutions.push(conflict.title)
        } catch (e) {
          failedResolutionIds.add(conflict.id)
          console.error(`Failed to keep local "${conflict.title}":`, e)
        }
      } else if (resolution === "notion") {
        pendingNotionResolutions.push(conflict)
      }
    }

    // Apply the captured remote snapshot directly. The original local record has
    // remained untouched while the dialog was open.
    if (pendingNotionResolutions.length > 0) {
      setSyncStatus("syncing")
      for (const conflict of pendingNotionResolutions) {
        try {
          if (conflict.type === "event") {
            await syncEvents([], [{
              id: conflict.localId,
              updates: conflict.remoteUpdates,
            }])
            await clearNotionIntent(settings.dataSourceId, "event", conflict.localId, "upsert")
          } else {
            await syncSessions([], [{
              id: conflict.localId,
              updates: conflict.remoteUpdates,
            }])
            await clearNotionIntent(settings.dataSourceId, "session", conflict.localId, "upsert")
          }
          notionResolutions.push(conflict.title)
        } catch (e) {
          failedResolutionIds.add(conflict.id)
          console.error(`Failed to keep Notion version for "${conflict.title}":`, e)
        }
      }
    }

    const parts: string[] = []
    if (localResolutions.length > 0) parts.push(`${localResolutions.length} kept local`)
    if (notionResolutions.length > 0) parts.push(`${notionResolutions.length} accepted from Notion`)
    if (skipped.length > 0) parts.push(`${skipped.length} skipped`)

    if (parts.length > 0) {
      toast.success(`Conflicts resolved: ${parts.join(", ")}`)
    }

    const failedConflicts = retainFailedNotionConflicts(notionConflicts, failedResolutionIds)
    setNotionConflicts(failedConflicts)
    if (failedConflicts.length > 0) {
      toast.error(`${failedConflicts.length} conflict resolution${failedConflicts.length === 1 ? "" : "s"} failed`, {
        description: "The unresolved items were kept open so you can retry.",
      })
      setNotionConflictDialogOpen(true)
    }
  }, [notionConflicts, syncEvents, syncSessions])


  return {
    syncStatus,
    lastSyncTime,
    notionConflicts,
    setNotionConflicts,
    notionConflictDialogOpen,
    setNotionConflictDialogOpen,
    performNotionSync,
    requestNotionSync,
    pushEventChange,
    pushSessionChange,
    resolveConflicts,
  }
}
