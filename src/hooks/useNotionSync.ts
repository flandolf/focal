import { useState, useCallback, useEffect, useRef } from "react"
import { toast } from "sonner"
import { getNotionCalendarSettings } from "@/lib/settings"
import { syncNotionCalendar, pushEventToNotion, pushSessionToNotion, type NotionCalendarSyncResult } from "@/lib/notion"
import type { CalendarEvent, StudySession, StudySessionDraft, Subject } from "@/lib/types"
import type { NotionConflict } from "@/components/NotionConflictDialog"

interface UseNotionSyncOptions {
  events: CalendarEvent[]
  sessions: StudySession[]
  allSubjects: Subject[]
  syncEvents: (created: Omit<CalendarEvent, "id" | "created_at">[], updated: { id: string; updates: Partial<Omit<CalendarEvent, "id" | "created_at">> }[]) => Promise<unknown>
  syncSessions: (created: StudySessionDraft[], updated: { id: string; updates: Partial<Omit<StudySession, "id" | "created_at">> }[]) => Promise<unknown>
}

export function useNotionSync({ events, sessions, allSubjects, syncEvents, syncSessions }: UseNotionSyncOptions) {
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error" | "success">("idle")
  const [lastSyncTime, setLastSyncTime] = useState(0)
  const [notionConflicts, setNotionConflicts] = useState<NotionConflict[]>([])
  const [notionConflictDialogOpen, setNotionConflictDialogOpen] = useState(false)

  const notionSyncInFlightRef = useRef(false)
  const notionSyncQueuedRef = useRef(false)
  const notionSyncQueuedNotifyRef = useRef(false)
  const notionSyncQueuedResolverRef = useRef<{ resolve: (value: NotionCalendarSyncResult | null) => void; reject: (reason: unknown) => void } | null>(null)
  const notionSyncRunnerRef = useRef<((notify: boolean, onProgress?: (msg: string) => void) => Promise<NotionCalendarSyncResult | null>) | null>(null)
  const eventsRef = useRef(events)
  const sessionsRef = useRef(sessions)
  const allSubjectsRef = useRef(allSubjects)

  // Debounce rapid sync requests into a single batched call
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingNotifyRef = useRef(false)
  const pendingResolveRef = useRef<((value: NotionCalendarSyncResult | null) => void) | null>(null)
  const pendingRejectRef = useRef<((reason: unknown) => void) | null>(null)

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
          notionSyncQueuedResolverRef.current = { resolve, reject }
        })
      }
      return null
    }

    notionSyncInFlightRef.current = true
    notionSyncQueuedRef.current = false
    setSyncStatus("syncing")
    try {
      const result = await syncNotionCalendar(settings, eventsRef.current, sessionsRef.current, allSubjectsRef.current, onProgress, changedEventIds, changedSessionIds)
      if (result.created.length > 0 || result.updated.length > 0) {
        await syncEvents(result.created, result.updated)
      }
      if (result.createdSessions.length > 0 || result.updatedSessions.length > 0) {
        await syncSessions(result.createdSessions, result.updatedSessions)
      }

      if (notify) {
        const pulled = result.created.length + result.updated.length + result.createdSessions.length + result.updatedSessions.length
        const pushed = result.pushedCreated + result.pushedUpdated
        const parts: string[] = []
        if (pulled > 0) parts.push(`${pulled} pulled`)
        if (pushed > 0) parts.push(`${pushed} pushed`)
        if (result.deleted > 0) parts.push(`${result.deleted} deleted`)
        toast.success(
          parts.length > 0
            ? `Synced Notion items: ${parts.join(", ")}`
            : "Notion items already up to date",
        )
        if (result.skipped > 0) {
          toast.info(`${result.skipped} Notion item${result.skipped === 1 ? "" : "s"} skipped without a valid date`, {
            description: result.skippedReasons[0],
          })
        }
        if (result.conflicts > 0 && result.conflictItems.length > 0) {
          const conflicts: NotionConflict[] = result.conflictItems.map((item, i) => ({
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
              title: `Notion version (last edited ${item.notionLastEditedTime ? new Date(item.notionLastEditedTime).toLocaleString() : "unknown"})`,
              startTime: item.startTime,
              endTime: item.endTime,
              url: item.notionUrl,
            },
          }))
          setNotionConflicts(conflicts)
          setNotionConflictDialogOpen(true)
        }
        if (result.pushErrors.length > 0) {
          toast.error(`${result.pushErrors.length} push error${result.pushErrors.length === 1 ? "" : "s"}`, {
            description: result.pushErrors[0],
          })
        }
        return result
      }
    } catch (e) {
      setSyncStatus("error")
      if (notify) {
        toast.error(`Notion sync failed: ${String(e)}`)
        throw e
      }
      console.error(`Notion sync failed: ${String(e)}`)
      return null
    } finally {
      const now = Date.now()
      setLastSyncTime(now)
      setSyncStatus("success")
      setTimeout(() => setSyncStatus("idle"), 2000)
      notionSyncInFlightRef.current = false
      if (notionSyncQueuedRef.current) {
        notionSyncQueuedRef.current = false
        const queuedNotify = notionSyncQueuedNotifyRef.current
        notionSyncQueuedNotifyRef.current = false
        const queuedResolver = notionSyncQueuedResolverRef.current
        notionSyncQueuedResolverRef.current = null
        const result = notionSyncRunnerRef.current?.(queuedNotify)
        if (queuedResolver && result) {
          result.then(
            (r) => queuedResolver.resolve(r),
            (err) => queuedResolver.reject(err),
          )
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
    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null
      const notifyNow = pendingNotifyRef.current
      pendingNotifyRef.current = false
      try {
        const result = await performNotionSync(notifyNow)
        pendingResolveRef.current?.(result)
      } catch (e) {
        pendingRejectRef.current?.(e)
      }
      pendingResolveRef.current = null
      pendingRejectRef.current = null
    }, 500)
  }, [performNotionSync])

  const pushEventChange = useCallback(async (event: CalendarEvent) => {
    const settings = getNotionCalendarSettings()
    if (!settings.token.trim() || !settings.dataSourceId.trim()) return
    setSyncStatus("syncing")
    try {
      const result = await pushEventToNotion(settings, event, allSubjectsRef.current)
      if (result) {
        await syncEvents([], [{ id: event.id, updates: { source: result.source } }])
      } else {
        // Fall back to full sync but pass the changed ID so fast-push is used
        void performNotionSync(false, undefined, new Set([event.id]))
      }
    } catch (e) {
      console.error("Failed to push event to Notion:", e)
      setSyncStatus("error")
    } finally {
      setSyncStatus("idle")
    }
  }, [syncEvents, performNotionSync])

  const pushSessionChange = useCallback(async (session: StudySession) => {
    const settings = getNotionCalendarSettings()
    if (!settings.token.trim() || !settings.dataSourceId.trim()) return
    setSyncStatus("syncing")
    try {
      const result = await pushSessionToNotion(settings, session, allSubjectsRef.current)
      if (result) {
        await syncSessions([], [{ id: session.id, updates: { source: result.source } }])
      } else {
        // Fall back to full sync but pass the changed ID so fast-push is used
        void performNotionSync(false, undefined, undefined, new Set([session.id]))
      }
    } catch (e) {
      console.error("Failed to push session to Notion:", e)
      setSyncStatus("error")
    } finally {
      setSyncStatus("idle")
    }
  }, [syncSessions, performNotionSync])

  const resolveConflicts = useCallback(async (resolutions: Record<string, "local" | "notion" | "skip">) => {
    const settings = getNotionCalendarSettings()
    if (!settings.token.trim() || !settings.dataSourceId.trim()) return

    const localResolutions: string[] = []
    const notionResolutions: string[] = []
    const skipped: string[] = []

    for (const conflict of notionConflicts) {
      const resolution = resolutions[conflict.id]
      if (!resolution || resolution === "skip") {
        skipped.push(conflict.title)
        continue
      }

      if (resolution === "local") {
        // Force-push local version to Notion
        localResolutions.push(conflict.title)
        if (conflict.type === "event") {
          const event = eventsRef.current.find((e) => e.id === conflict.localId)
          if (event) {
            try {
              await pushEventToNotion(settings, event, allSubjectsRef.current)
            } catch (e) {
              console.error(`Failed to force-push event "${conflict.title}":`, e)
            }
          }
        } else {
          const session = sessionsRef.current.find((s) => s.id === conflict.localId)
          if (session) {
            try {
              await pushSessionToNotion(settings, session, allSubjectsRef.current)
            } catch (e) {
              console.error(`Failed to force-push session "${conflict.title}":`, e)
            }
          }
        }
      } else if (resolution === "notion") {
        // Will be resolved on next full sync (pull will overwrite local)
        notionResolutions.push(conflict.title)
      }
    }

    // For "notion" resolutions, trigger a full re-sync to pull Notion changes
    if (notionResolutions.length > 0) {
      setSyncStatus("syncing")
      try {
        await performNotionSync(true)
      } catch (e) {
        console.error("Failed to pull Notion changes for resolution:", e)
      }
    }

    const parts: string[] = []
    if (localResolutions.length > 0) parts.push(`${localResolutions.length} kept local`)
    if (notionResolutions.length > 0) parts.push(`${notionResolutions.length} accepted from Notion`)
    if (skipped.length > 0) parts.push(`${skipped.length} skipped`)

    if (parts.length > 0) {
      toast.success(`Conflicts resolved: ${parts.join(", ")}`)
    }

    setNotionConflicts([])
  }, [notionConflicts, performNotionSync, eventsRef, sessionsRef, allSubjectsRef, setNotionConflicts])


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
