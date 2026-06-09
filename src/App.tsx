import { useState, useCallback, useEffect, useMemo, useRef, type MouseEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { downloadDir } from "@tauri-apps/api/path"
import { open } from "@tauri-apps/plugin-dialog"
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion"
import { Toaster, toast } from "sonner"
import { FolderOpen, Search, Settings } from "lucide-react"
import { Sidebar } from "@/components/Sidebar"
import { ProjectDetail } from "@/components/ProjectDetail"
import { HomeView } from "@/components/HomeView"
import { ProjectDialog } from "@/components/ProjectDialog"
import { StudySessionDialog } from "@/components/StudySessionDialog"
import { EventDialog } from "@/components/EventDialog"
import { GlobalSearch } from "@/components/GlobalSearch"
import { TimetableView } from "@/components/timetable/TimetableView"
import { DataExport } from "@/components/DataExport"
import { CustomSubjects } from "@/components/CustomSubjects"
import { SettingsView } from "@/components/SettingsView"
import { AnalyticsView } from "@/components/analytics/AnalyticsView"
import { NotionConflictDialog } from "@/components/NotionConflictDialog"
import { NotionSyncIndicator } from "@/components/NotionSyncIndicator"
import { useProjects } from "@/hooks/useProjects"
import { useStudySessions } from "@/hooks/useStudySessions"
import { useEvents } from "@/hooks/useEvents"
import { useDeadlineNotifications } from "@/hooks/useDeadlineNotifications"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useNotionSync } from "@/hooks/useNotionSync"
import { useTheme } from "@/lib/themes"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import { showUndoToast } from "@/lib/undoToast"
import { getNotionCalendarSettings, getTimetableConfig } from "@/lib/settings"
import { isPomodoroSession, getPomodoroDescription, getPomodoroNotes, getPomodoroTitle, POMODORO_DESCRIPTION_PREFIX, getAdjacentPomodoroSession, getUniqueStrings, getUniqueArrayItems } from "@/lib/pomodoro"
import { deleteNotionPage } from "@/lib/notion/api"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { VCE_SUBJECTS, type CalendarEvent, type ConfidenceScore, type EventType, type StudySession, type StudySessionStatus, type Subject } from "@/lib/types"

const MOTION_EASE = [0.16, 1, 0.3, 1] as const
const SHELL_LAYOUT_TRANSITION = { duration: 0.24, ease: MOTION_EASE } as const
const VIEW_TRANSITION = { duration: 0.18, ease: MOTION_EASE } as const
const HIDDEN_SUBJECTS_STORAGE_KEY = "focal-hidden-subjects"

function getStoredHiddenSubjectIds() {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(HIDDEN_SUBJECTS_STORAGE_KEY)
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

function isStoredSubject(value: unknown): value is Subject {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.shortCode === "string" &&
    typeof record.color === "string" &&
    (record.icon === undefined || typeof record.icon === "string")
  )
}

function getStoredCustomSubjects() {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem("focal-custom-subjects")
    const parsed: unknown = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed.filter(isStoredSubject) : []
  } catch {
    return []
  }
}

function App() {
  const { projects, addProject, updateProject, deleteProject, addCustomSubfolder, removeCustomSubfolder, restoreProject } = useProjects()
  const { sessions, loading: sessionsLoading, addSession, addSessions, updateSession, updateSessions, deleteSession, deleteSessions, restoreSession, restoreSessions, updateAndDeleteSessions, syncSessions: rawSyncSessions } = useStudySessions()
  const { events, loading: eventsLoading, addEvent, addEvents, updateEvent, updateEvents, deleteEvent, deleteEvents, restoreEvent, restoreEvents, updateAndDeleteEvents, syncEvents } = useEvents()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [homeSelected, setHomeSelected] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<StudySession | null>(null)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [newItemInitialDate, setNewItemInitialDate] = useState<Date | undefined>(undefined)
  const [newItemDialogKey, setNewItemDialogKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState(false)
  const [analyticsView, setAnalyticsView] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [timetableView, setTimetableView] = useState(false)
  const [timetableConfig, setTimetableConfig] = useState(getTimetableConfig)

  // Keep timetableConfig in sync with localStorage changes
  useEffect(() => {
    const handler = () => setTimetableConfig(getTimetableConfig())
    window.addEventListener("focal-timetable-updated", handler)
    return () => window.removeEventListener("focal-timetable-updated", handler)
  }, [])
  const reduceMotion = useReducedMotion()
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(getStoredCustomSubjects)
  const [hiddenSubjectIds, setHiddenSubjectIds] = useState<string[]>(getStoredHiddenSubjectIds)
  const { theme, mode, resolvedDark, setTheme, setMode } = useTheme()
  const syncSessions = rawSyncSessions
  const allSubjects = useMemo(() => [...VCE_SUBJECTS, ...customSubjects], [customSubjects])
  const availableSubjects = useMemo(
    () => allSubjects.filter((subject) => !hiddenSubjectIds.includes(subject.id)),
    [allSubjects, hiddenSubjectIds],
  )

  const {
    syncStatus,
    lastSyncTime,
    notionConflicts,
    notionConflictDialogOpen,
    setNotionConflictDialogOpen,
    setNotionConflicts,
    performNotionSync,
    requestNotionSync,
    pushEventChange,
    pushSessionChange,
  } = useNotionSync({ events, sessions, allSubjects, syncEvents, syncSessions })

  useEffect(() => {
    localStorage.setItem("focal-custom-subjects", JSON.stringify(customSubjects))
  }, [customSubjects])

  useEffect(() => {
    localStorage.setItem(HIDDEN_SUBJECTS_STORAGE_KEY, JSON.stringify(hiddenSubjectIds))
  }, [hiddenSubjectIds])

  const handleToggleSubjectVisibility = useCallback((subjectId: string) => {
    setHiddenSubjectIds((current) => (
      current.includes(subjectId)
        ? current.filter((id) => id !== subjectId)
        : [...current, subjectId]
    ))
  }, [])

  const handleShowAllSubjects = useCallback(() => {
    setHiddenSubjectIds([])
  }, [])

  const initialAutoSyncDoneRef = useRef(false)
  useEffect(() => {
    if (eventsLoading || sessionsLoading) return
    if (initialAutoSyncDoneRef.current) return
    initialAutoSyncDoneRef.current = true
    void performNotionSync(false)
  }, [eventsLoading, sessionsLoading, performNotionSync])

  useEffect(() => {
    if (eventsLoading || sessionsLoading) return
    const syncNow = () => {
      void requestNotionSync(false)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncNow()
      }
    }
    const interval = window.setInterval(syncNow, 60 * 1000)
    window.addEventListener("focus", syncNow)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("focus", syncNow)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [eventsLoading, sessionsLoading, requestNotionSync])

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null

  const refreshFileCounts = useCallback(async () => {
    const counts: Record<string, number> = {}
    for (const project of projects) {
      try {
        const count = await invoke<number>("get_project_file_count", {
          projectName: project.folder_path,
        })
        counts[project.id] = count
      } catch {
        counts[project.id] = 0
      }
    }
    setFileCounts(counts)
  }, [projects])

  // Check for timely study notifications on app load and when planning data changes
  useDeadlineNotifications(projects, events, sessions)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshFileCounts()
  }, [refreshFileCounts])

  const handleSelectProject = (id: string) => {
    setSelectedId(id)
    setHomeSelected(false)
    setSettingsView(false)
    setAnalyticsView(false)
  }

  const handleSelectHome = () => {
    setSelectedId(null)
    setHomeSelected(true)
    setSettingsView(false)
    setTimetableView(false)
    setAnalyticsView(false)
  }

  const handleSelectTimetable = () => {
    setSelectedId(null)
    setHomeSelected(false)
    setSettingsView(false)
    setAnalyticsView(false)
    setTimetableView(true)
  }

  const handleSelectAnalytics = () => {
    setSelectedId(null)
    setHomeSelected(false)
    setSettingsView(false)
    setTimetableView(false)
    setAnalyticsView(true)
  }

  const handleOpenNewSession = (initialDate?: Date) => {
    setSelectedSession(null)
    setNewItemInitialDate(initialDate)
    setNewItemDialogKey((key) => key + 1)
    setSessionDialogOpen(true)
  }

  const handleOpenNewEvent = (initialDate?: Date) => {
    setSelectedEvent(null)
    setNewItemInitialDate(initialDate)
    setNewItemDialogKey((key) => key + 1)
    setEventDialogOpen(true)
  }

  useKeyboardShortcuts({
    onSearch: () => setSearchOpen(true),
    onNewAssessment: () => setDialogOpen(true),
    onNewEvent: () => handleOpenNewEvent(),
    onNewSession: () => handleOpenNewSession(),
    onGoHome: handleSelectHome,
    onGoAnalytics: handleSelectAnalytics,
    onToggleSidebar: () => setSidebarCollapsed((prev) => !prev),
  })

  const handleAddFileFromSidebar = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: await downloadDir(),
    })

    if (!selected || selected.length === 0) return

    try {
      await invoke("move_files_to_project", {
        files: selected,
        projectName: project.name,
      })
      await refreshFileCounts()
      toast.success(`Added ${selected.length} file${selected.length === 1 ? "" : "s"} to ${project.name}`)
    } catch (e) {
      console.error("Failed to add files:", e)
      toast.error("Failed to add files")
    }
  }, [projects, refreshFileCounts])

  const handleResolveConflicts = useCallback((resolutions: Record<string, "local" | "notion" | "skip">) => {
    const resolved = Object.entries(resolutions).map(([id, resolution]) => `${id}: ${resolution}`)
    toast.success(`Resolved ${Object.keys(resolutions).length} conflict${Object.keys(resolutions).length === 1 ? "" : "s"}`, {
      description: resolved.join(", "),
    })
    setNotionConflicts([])
  }, [setNotionConflicts])

  const handleCreateProject = async (data: {
    name: string
    description?: string
    icon?: string
    subjectId?: string
    unit?: "1" | "2" | "3" | "4"
  }) => {
    try {
      const project = await addProject(
        data.name,
        data.description,
        data.icon,
        undefined,
        data.subjectId,
        data.unit,
      )
      setSelectedId(project.id)
      setHomeSelected(false)
      toast.success(`Assessment "${data.name}" created`)
    } catch (e) {
      toast.error(`Failed to create assessment: ${String(e)}`)
    }
  }

  const handleUpdateProject = async (
    id: string,
    data: {
      name: string
      description?: string
      icon?: string
      subjectId?: string
      unit?: "1" | "2" | "3" | "4"
      isFavorite?: boolean
      isArchived?: boolean
      isFinished?: boolean
    }
  ) => {
    try {
      await updateProject(id, data)
      toast.success(`Assessment updated`)
    } catch (e) {
      toast.error(`Failed to update assessment: ${String(e)}`)
    }
  }

  const handleDeleteProject = async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const confirmed = await confirmDestructiveAction({
      title: `Delete "${project.name}"?`,
      description: "This also removes associated study sessions.",
      actionLabel: "Delete",
    })
    if (!confirmed) return
    try {
      await deleteProject(id)
      if (selectedId === id) {
        setSelectedId(null)
        setHomeSelected(true)
      }
      showUndoToast({
        message: `Assessment "${project.name}" deleted`,
        onUndo: async () => {
          await restoreProject(project)
          toast.success(`Assessment "${project.name}" restored`)
        },
      })
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to delete assessment: ${String(e)}`)
    }
  }

  const handleCreateStudySession = async (data: {
    id?: string
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
    status?: StudySessionStatus
    confidence?: ConfidenceScore
    blockers?: string
    nextAction?: string
    completedAt?: string
  }) => {
    try {
      const newSession = await addSession(
        data.projectId,
        data.subjectIds,
        data.title,
        data.startTime,
        data.endTime,
        data.description,
        data.topics,
        data.notes,
      )
      toast.success(`Study session "${data.title}" created`)
      setSessionDialogOpen(false)
      void pushSessionChange(newSession)
    } catch (e) {
      toast.error(`Failed to create study session: ${String(e)}`)
    }
  }

  const handleCreateStudySessions = async (items: {
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
  }[]) => {
    try {
      await addSessions(items)
      toast.success(`${items.length} study session${items.length !== 1 ? "s" : ""} created`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to create study sessions: ${String(e)}`)
      throw e
    }
  }

  const handleStartPomodoroSession = async (data: {
    subjectIds: string[]
    durationSeconds: number
    projectId?: string
    cycleNumber: number
  }) => {
    try {
      const start = new Date()
      const end = new Date(start.getTime() + data.durationSeconds * 1000)
      const adjacentSession = getAdjacentPomodoroSession(sessions, data, start, end)

      if (adjacentSession) {
        const mergedStart = new Date(Math.min(new Date(adjacentSession.startTime).getTime(), start.getTime()))
        const mergedEnd = new Date(Math.max(new Date(adjacentSession.endTime).getTime(), end.getTime()))

        const existingDurations = adjacentSession.activeDurations && adjacentSession.activeDurations.length > 0
          ? adjacentSession.activeDurations
          : [{ start: adjacentSession.startTime, end: adjacentSession.endTime }]
        const newActiveDurations = [...existingDurations, { start: start.toISOString(), end: end.toISOString() }]
        const mergedDurationMin = Math.round(newActiveDurations.reduce((sum, d) => {
          return sum + (new Date(d.end).getTime() - new Date(d.start).getTime())
        }, 0) / 60000)

        await updateSession(adjacentSession.id, {
          startTime: mergedStart.toISOString(),
          endTime: mergedEnd.toISOString(),
          activeDurations: newActiveDurations,
          status: "in-progress",
          completedAt: undefined,
          description: `${POMODORO_DESCRIPTION_PREFIX} ${mergedDurationMin}m focus (extended)`,
        })
        toast.success("Pomodoro session merged on calendar")
        const updatedSession = { ...adjacentSession, startTime: mergedStart.toISOString(), endTime: mergedEnd.toISOString(), activeDurations: newActiveDurations, status: "in-progress" as const, completedAt: undefined, description: `${POMODORO_DESCRIPTION_PREFIX} ${mergedDurationMin}m focus (extended)` }
        void pushSessionChange(updatedSession)
        return updatedSession
      }

      const durationMinutes = Math.round(data.durationSeconds / 60)
      const projectName = data.projectId ? projects.find((p) => p.id === data.projectId)?.name : undefined
      const blockStart = start.toISOString()
      const blockEnd = end.toISOString()
      const session = await addSession(
        data.projectId,
        data.subjectIds,
        getPomodoroTitle(data.subjectIds, data.cycleNumber, projectName),
        blockStart,
        blockEnd,
        getPomodoroDescription(durationMinutes, data.cycleNumber),
        undefined,
        getPomodoroNotes(data.cycleNumber),
        "in-progress",
        [{ start: blockStart, end: blockEnd }],
      )
      toast.success("Pomodoro session added to calendar")
      void pushSessionChange(session)
      return session
    } catch (e) {
      toast.error(`Failed to start Pomodoro session: ${String(e)}`)
      throw e
    }
  }

  const handleUpdatePomodoroSession = async (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => {
    try {
      const session = sessions.find((s) => s.id === id)
      const effectiveUpdates = { ...updates }

      if (session && updates.subjectIds && isPomodoroSession(session)) {
        const cycleMatch = /Focus #(\d+)/.exec(session.title)
        const cycleNumber = cycleMatch ? parseInt(cycleMatch[1], 10) : 1
        const projectName = session.projectId
          ? projects.find((p) => p.id === session.projectId)?.name
          : undefined
        effectiveUpdates.title = getPomodoroTitle(updates.subjectIds, cycleNumber, projectName)
      }

      await updateSession(id, effectiveUpdates)
      if (session) void pushSessionChange({ ...session, ...effectiveUpdates })
    } catch (e) {
      toast.error(`Failed to update Pomodoro session: ${String(e)}`)
      throw e
    }
  }

  const handleEditStudySession = async (data: {
    id?: string
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
    status?: StudySessionStatus
    confidence?: ConfidenceScore
    blockers?: string
    nextAction?: string
    completedAt?: string
  }) => {
    if (!data.id) return
    try {
      const updates: Partial<Omit<StudySession, "id" | "created_at">> = {
        projectId: data.projectId,
        subjectIds: data.subjectIds,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        description: data.description,
        topics: data.topics,
        notes: data.notes,
      }
      if (data.status) updates.status = data.status
      updates.confidence = data.confidence
      updates.blockers = data.blockers
      updates.nextAction = data.nextAction
      updates.completedAt = data.completedAt
      await updateSession(data.id, updates)
      toast.success("Study session updated")
      setSessionDialogOpen(false)
      setSelectedSession(null)
      const sessionForPush = sessions.find((s: StudySession) => s.id === data.id)
      if (sessionForPush) void pushSessionChange({ ...sessionForPush, ...updates })
    } catch (e) {
      toast.error(`Failed to update study session: ${String(e)}`)
    }
  }

  const handleDeleteStudySession = async (id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    const confirmed = await confirmDestructiveAction({
      title: `Delete "${session.title}"?`,
      description: "This study session will be removed from your calendar.",
      actionLabel: "Delete",
    })
    if (!confirmed) return
    try {
      await deleteSession(id)
      if (session.source?.type === "notion" && session.source.id) {
        const settings = getNotionCalendarSettings()
        if (settings.token.trim() && settings.dataSourceId.trim()) {
          void deleteNotionPage(settings, session.source.id).catch((e) => {
            console.error("Failed to delete Notion page:", e)
            toast.error("Failed to delete session from Notion — it may reappear on next sync")
          })
        }
      }
      showUndoToast({
        message: "Study session deleted",
        onUndo: async () => {
          await restoreSession(session)
          toast.success("Study session restored")
        },
      })
      setSessionDialogOpen(false)
      setSelectedSession(null)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to delete study session: ${String(e)}`)
    }
  }

  const handleCreateEvent = async (data: {
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
    isFinished?: boolean
    finishedAt?: string
  }) => {
    try {
      const created = await addEvent(data)
      toast.success(`Event "${data.title}" added`)
      setEventDialogOpen(false)
      void pushEventChange(created)
    } catch (e) {
      toast.error(`Failed to add event: ${String(e)}`)
    }
  }

  const handleCreateEvents = async (items: Omit<CalendarEvent, "id" | "created_at">[]) => {
    try {
      await addEvents(items)
      toast.success(`${items.length} event${items.length !== 1 ? "s" : ""} added`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to add events: ${String(e)}`)
      throw e
    }
  }

  const handleEditEvent = async (data: {
    id: string
    title: string
    description?: string
    startTime: string
    endTime?: string
    eventType: EventType
    subjectId?: string
    location?: string
    isFinished?: boolean
    finishedAt?: string
  }) => {
    try {
      await updateEvent(data.id, {
        title: data.title,
        description: data.description,
        startTime: data.startTime,
        endTime: data.endTime,
        eventType: data.eventType,
        subjectId: data.subjectId,
        location: data.location,
        isFinished: data.isFinished,
        finishedAt: data.finishedAt,
      })
      toast.success("Event updated")
      setEventDialogOpen(false)
      setSelectedEvent(null)
      const { id, ...rest } = data
      void pushEventChange({ ...events.find((e: CalendarEvent) => e.id === id), ...rest } as CalendarEvent)
    } catch (e) {
      toast.error(`Failed to update event: ${String(e)}`)
    }
  }

  const handleDeleteEvent = async (id: string) => {
    const event = events.find((item) => item.id === id)
    if (!event) return
    const confirmed = await confirmDestructiveAction({
      title: `Delete "${event.title}"?`,
      description: "This event will be removed from your calendar.",
      actionLabel: "Delete",
    })
    if (!confirmed) return
    try {
      await deleteEvent(id)
      if (event.source?.type === "notion" && event.source.id) {
        const settings = getNotionCalendarSettings()
        if (settings.token.trim() && settings.dataSourceId.trim()) {
          void deleteNotionPage(settings, event.source.id).catch((e) => {
            console.error("Failed to delete Notion page:", e)
            toast.error("Failed to delete event from Notion — it may reappear on next sync")
          })
        }
      }
      showUndoToast({
        message: "Event deleted",
        onUndo: async () => {
          await restoreEvent(event)
          toast.success("Event restored")
        },
      })
      setEventDialogOpen(false)
      setSelectedEvent(null)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to delete event: ${String(e)}`)
    }
  }

  const handleDeleteCalendarItems = async (itemIds: { eventIds: string[]; sessionIds: string[] }) => {
    const total = itemIds.eventIds.length + itemIds.sessionIds.length
    if (total === 0) return
    const confirmed = await confirmDestructiveAction({
      title: `Delete ${total} selected calendar item${total === 1 ? "" : "s"}?`,
      description: "Selected events and study sessions will be removed.",
      actionLabel: "Delete",
    })
    if (!confirmed) return

    const deletedEvents = itemIds.eventIds
      .map((id) => events.find((e) => e.id === id))
      .filter((e): e is CalendarEvent => Boolean(e))
    const deletedSessions = itemIds.sessionIds
      .map((id) => sessions.find((s) => s.id === id))
      .filter((s): s is StudySession => Boolean(s))

    try {
      await Promise.all([
        itemIds.eventIds.length > 0 ? deleteEvents(itemIds.eventIds) : Promise.resolve(),
        itemIds.sessionIds.length > 0 ? deleteSessions(itemIds.sessionIds) : Promise.resolve(),
      ])
      // Delete Notion pages for sourced items in parallel (collect failures for toast)
      const settings = getNotionCalendarSettings()
      const canDeleteNotion = settings.token.trim() && settings.dataSourceId.trim()
      if (canDeleteNotion) {
        const notionPageIds: string[] = [
          ...deletedEvents.filter((e) => e.source?.type === "notion" && e.source.id).map((e) => e.source!.id),
          ...deletedSessions.filter((s) => s.source?.type === "notion" && s.source.id).map((s) => s.source!.id),
        ]
        const failedIds: string[] = []
        await Promise.allSettled(
          notionPageIds.map((pageId) =>
            deleteNotionPage(settings, pageId).catch((e) => {
              console.error("Failed to delete Notion page:", e)
              failedIds.push(pageId)
            })
          )
        )
        if (failedIds.length > 0) {
          toast.error(`${failedIds.length} item${failedIds.length === 1 ? "" : "s"} failed to delete from Notion — they may reappear on next sync`)
        }
      }

      showUndoToast({
        message: `${total} calendar item${total === 1 ? "" : "s"} deleted`,
        onUndo: async () => {
          await Promise.all([
            deletedEvents.length > 0 ? restoreEvents(deletedEvents) : Promise.resolve(),
            deletedSessions.length > 0 ? restoreSessions(deletedSessions) : Promise.resolve(),
          ])
          toast.success(`${total} calendar item${total === 1 ? "" : "s"} restored`)
        },
      })
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to delete calendar items: ${String(e)}`)
      throw e
    }
  }

  const handleSetCalendarItemsCompleted = async (itemIds: { eventIds: string[]; sessionIds: string[] }, isCompleted: boolean) => {
    const total = itemIds.eventIds.length + itemIds.sessionIds.length
    if (total === 0) return
    const completedAt = isCompleted ? new Date().toISOString() : undefined
    try {
      await Promise.all([
        itemIds.eventIds.length > 0
          ? updateEvents(itemIds.eventIds.map((id) => ({
            id,
            updates: { isFinished: isCompleted, finishedAt: completedAt },
          })))
          : Promise.resolve(),
        itemIds.sessionIds.length > 0
          ? updateSessions(itemIds.sessionIds.map((id) => ({
            id,
            updates: {
              status: isCompleted ? "completed" : "planned",
              completedAt,
            },
          })))
          : Promise.resolve(),
      ])
      toast.success(`${total} calendar item${total === 1 ? "" : "s"} marked ${isCompleted ? "complete" : "current"}`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to update calendar items: ${String(e)}`)
      throw e
    }
  }

  const handleMergeEvents = async (ids: string[]) => {
    const selectedEvents = ids
      .map((id) => events.find((event) => event.id === id))
      .filter((event): event is CalendarEvent => Boolean(event))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    if (selectedEvents.length < 2) return

    const keeper = selectedEvents[0]
    const startMs = Math.min(...selectedEvents.map((event) => new Date(event.startTime).getTime()).filter(Number.isFinite))
    const endMs = Math.max(...selectedEvents.map((event) => new Date(event.endTime ?? event.startTime).getTime()).filter(Number.isFinite))
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      toast.error("Failed to merge events: invalid event time")
      return
    }

    const descriptions = selectedEvents
      .map((event) => event.description?.trim())
      .filter((description): description is string => Boolean(description))
    const uniqueDescriptions = Array.from(new Set(descriptions))
    const allComplete = selectedEvents.every((event) => event.isFinished)
    const sameSubject = selectedEvents.every((event) => event.subjectId === keeper.subjectId)
    const sameLocation = selectedEvents.every((event) => event.location === keeper.location)

    try {
      await updateAndDeleteEvents(
        [{
          id: keeper.id,
          updates: {
            title: selectedEvents.length === 2
              ? `${selectedEvents[0].title} / ${selectedEvents[1].title}`
              : `${selectedEvents[0].title} + ${selectedEvents.length - 1} more`,
            description: uniqueDescriptions.length > 0 ? uniqueDescriptions.join("\n\n") : keeper.description,
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
            eventType: keeper.eventType,
            subjectId: sameSubject ? keeper.subjectId : undefined,
            location: sameLocation ? keeper.location : undefined,
            isFinished: allComplete,
            finishedAt: allComplete ? (keeper.finishedAt ?? new Date().toISOString()) : undefined,
          },
        }],
        selectedEvents.slice(1).map((event) => event.id),
      )

      // Delete Notion pages for merged-away events in parallel
      const settings = getNotionCalendarSettings()
      const canDeleteNotion = settings.token.trim() && settings.dataSourceId.trim()
      if (canDeleteNotion) {
        const notionPageIds = selectedEvents.slice(1)
          .filter((e) => e.source?.type === "notion" && e.source.id)
          .map((e) => e.source!.id)
        notionPageIds.forEach((pageId) => {
          void deleteNotionPage(settings, pageId).catch((e) => {
            console.error("Failed to delete Notion page:", e)
          })
        })
      }

      toast.success(`${selectedEvents.length} events merged`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to merge events: ${String(e)}`)
      throw e
    }
  }

  const handleMergeStudySessions = async (ids: string[]) => {
    const selectedSessions = ids
      .map((id) => sessions.find((session) => session.id === id))
      .filter((session): session is StudySession => Boolean(session))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

    if (selectedSessions.length < 2) return

    const keeper = selectedSessions[0]
    const startMs = Math.min(...selectedSessions.map((session) => new Date(session.startTime).getTime()).filter(Number.isFinite))
    const endMs = Math.max(...selectedSessions.map((session) => new Date(session.endTime).getTime()).filter(Number.isFinite))
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      toast.error("Failed to merge study sessions: invalid session time")
      return
    }

    const descriptions = getUniqueStrings(selectedSessions.map((session) => session.description))
    const notes = getUniqueStrings(selectedSessions.map((session) => session.notes))
    const blockers = getUniqueStrings(selectedSessions.map((session) => session.blockers))
    const nextActions = getUniqueStrings(selectedSessions.map((session) => session.nextAction))
    const topicItems = getUniqueArrayItems(selectedSessions.map((session) => session.topics))
    const subjectIds = getUniqueArrayItems(selectedSessions.map((session) => session.subjectIds))
    const sameProject = selectedSessions.every((session) => session.projectId === keeper.projectId)
    const sameConfidence = selectedSessions.every((session) => session.confidence === keeper.confidence)
    const allComplete = selectedSessions.every((session) => session.status === "completed")
    const anyInProgress = selectedSessions.some((session) => session.status === "in-progress")
    const completedAtValues = selectedSessions
      .map((session) => session.completedAt)
      .filter((completedAt): completedAt is string => Boolean(completedAt))
      .sort()

    try {
      await updateAndDeleteSessions(
        [{
          id: keeper.id,
          updates: {
            projectId: sameProject ? keeper.projectId : undefined,
            subjectIds,
            title: selectedSessions.length === 2
              ? `${selectedSessions[0].title} / ${selectedSessions[1].title}`
              : `${selectedSessions[0].title} + ${selectedSessions.length - 1} more`,
            description: descriptions.length > 0 ? descriptions.join("\n\n") : keeper.description,
            startTime: new Date(startMs).toISOString(),
            endTime: new Date(endMs).toISOString(),
            activeDurations: selectedSessions.map((s) => ({
              start: s.startTime,
              end: s.endTime,
            })),
            status: allComplete ? "completed" : anyInProgress ? "in-progress" : "planned",
            topics: topicItems.length > 0 ? topicItems : undefined,
            notes: notes.length > 0 ? notes.join("\n\n") : keeper.notes,
            confidence: sameConfidence ? keeper.confidence : undefined,
            blockers: blockers.length > 0 ? blockers.join("\n\n") : keeper.blockers,
            nextAction: nextActions.length > 0 ? nextActions.join("\n\n") : keeper.nextAction,
            completedAt: allComplete ? (completedAtValues[0] ?? new Date().toISOString()) : undefined,
          },
        }],
        selectedSessions.slice(1).map((session) => session.id),
      )

      // Delete Notion pages for merged-away sessions in parallel
      const settings = getNotionCalendarSettings()
      const canDeleteNotion = settings.token.trim() && settings.dataSourceId.trim()
      if (canDeleteNotion) {
        const notionPageIds = selectedSessions.slice(1)
          .filter((s) => s.source?.type === "notion" && s.source.id)
          .map((s) => s.source!.id)
        notionPageIds.forEach((pageId) => {
          void deleteNotionPage(settings, pageId).catch((e) => {
            console.error("Failed to delete Notion page:", e)
          })
        })
      }

      toast.success(`${selectedSessions.length} study sessions merged`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to merge study sessions: ${String(e)}`)
      throw e
    }
  }

  const handleToggleFavorite = async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    try {
      await updateProject(id, { isFavorite: !project.isFavorite })
    } catch (e) {
      toast.error(`Failed to update assessment: ${String(e)}`)
    }
  }

  const handleToggleArchive = async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    try {
      await updateProject(id, { isArchived: !project.isArchived })
      if (!project.isArchived) {
        toast.success(`"${project.name}" archived`)
      } else {
        toast.success(`"${project.name}" restored`)
        setSelectedId(project.id)
        setHomeSelected(false)
      }
    } catch (e) {
      toast.error(`Failed to update assessment: ${String(e)}`)
    }
  }

  const handleToggleFinished = async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    try {
      await updateProject(id, { isFinished: !project.isFinished })
      if (!project.isFinished) {
        toast.success(`"${project.name}" marked as complete`)
      } else {
        toast.success(`"${project.name}" marked as current`)
      }
    } catch (e) {
      toast.error(`Failed to update assessment: ${String(e)}`)
    }
  }

  const handleSelectSession = (session: StudySession) => {
    setSelectedSession(session)
    setSessionDialogOpen(true)
  }

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setEventDialogOpen(true)
  }

  const handleMoveEvent = useCallback((eventId: string, newStartTime: string, newEndTime?: string) => {
    const updates: Partial<Omit<CalendarEvent, "id" | "created_at">> = { startTime: newStartTime }
    if (newEndTime) {
      updates.endTime = newEndTime
    }
    void updateEvent(eventId, updates)
  }, [updateEvent])

  const handleSyncNotionCalendar = async (onProgress: (msg: string) => void) => {
    return performNotionSync(true, onProgress)
  }

  const handleTitlebarDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) return
    void getCurrentWindow().startDragging().catch(() => undefined)
  }

  const contentKey = settingsView ? "settings" : analyticsView ? "analytics" : timetableView ? "timetable" : homeSelected ? "home" : selectedProject ? `project-${selectedProject.id}` : "empty"
  const layoutTransition = reduceMotion ? { duration: 0 } : SHELL_LAYOUT_TRANSITION
  const viewTransition = reduceMotion ? { duration: 0 } : VIEW_TRANSITION

  return (
    <TooltipProvider>
      <MotionConfig reducedMotion="user">
      <div className="focal-shell relative h-screen overflow-hidden px-2 pb-2 pt-(--app-titlebar-inset) text-foreground min-[1200px]:px-3 min-[1200px]:pb-3">
        <div
          data-tauri-drag-region
          onMouseDown={handleTitlebarDrag}
          className="app-titlebar-drag-region absolute inset-x-0 top-0 z-20"
        />
        <div className="app-titlebar-actions absolute left-(--app-titlebar-actions-left) top-(--app-titlebar-control-top) z-30 flex h-(--app-titlebar-control-size) items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSearchOpen(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background/65 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label="Search"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">Search · ⌘K</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSettingsView(true)}
                className="flex h-7 w-7 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background/65 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-label="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">Settings</TooltipContent>
          </Tooltip>
          <NotionSyncIndicator
            status={syncStatus}
            lastSyncTime={lastSyncTime}
            onClick={() => requestNotionSync(true)}
            disabled={syncStatus === "syncing"}
          />
        </div>
        <div className="hairline-grid pointer-events-none absolute inset-0 opacity-80" />
        <div
          className="relative z-10 flex h-full gap-2 min-[1200px]:gap-3"
        >
          <motion.div
            layout
            className="min-h-0 shrink-0"
            style={{ width: sidebarCollapsed ? "4.5rem" : "clamp(12rem, 24vw, 17rem)" }}
            transition={layoutTransition}
          >
            <Sidebar
              projects={projects}
              sessions={sessions}
              customSubjects={customSubjects}
              availableSubjects={availableSubjects}
              selectedId={selectedId}
              homeSelected={homeSelected}
              analyticsSelected={analyticsView}
              isCollapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
              onSelect={handleSelectProject}
              onSelectHome={handleSelectHome}
              onSelectAnalytics={handleSelectAnalytics}
              onDelete={handleDeleteProject}
              onNewProject={() => setDialogOpen(true)}
              onToggleFavorite={handleToggleFavorite}
              onToggleArchive={handleToggleArchive}
              onToggleFinished={handleToggleFinished}
              onStartPomodoroSession={handleStartPomodoroSession}
              onUpdatePomodoroSession={handleUpdatePomodoroSession}
              onDeletePomodoroSession={handleDeleteStudySession}
              onAddFile={handleAddFileFromSidebar}
              fileCounts={fileCounts}
              onSelectTimetable={handleSelectTimetable}
              timetableSelected={timetableView}
            />
          </motion.div>
          <motion.main
            layout
            transition={layoutTransition}
            className="glass-panel min-w-0 flex-1 overflow-hidden rounded-2xl min-[1200px]:rounded-[1.35rem]"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={contentKey}
                className="h-full"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                transition={viewTransition}
              >
                {settingsView ? (
                  <SettingsView
                    onBack={() => setSettingsView(false)}
                    theme={theme}
                    mode={mode}
                    resolvedDark={resolvedDark}
                    setTheme={setTheme}
                    setMode={setMode}
                    subjects={allSubjects}
                    hiddenSubjectIds={hiddenSubjectIds}
                    onToggleSubjectVisibility={handleToggleSubjectVisibility}
                    onShowAllSubjects={handleShowAllSubjects}
                    onOpenExport={() => setExportOpen(true)}
                    onOpenSubjects={() => setSubjectsOpen(true)}
                    onSyncNotionCalendar={handleSyncNotionCalendar}
                    lastSyncTime={lastSyncTime}
                  />
                ) : timetableView ? (
                  <TimetableView
                    customSubjects={customSubjects}
                  />
                ) : analyticsView ? (
                  <AnalyticsView
                    sessions={sessions}
                    projects={projects}
                    onNewSession={handleOpenNewSession}
                  />
                ) : homeSelected ? (
                  <HomeView
                    projects={projects}
                    sessions={sessions}
                    events={events}
                    onSelectProject={handleSelectProject}
                    onSelectSession={handleSelectSession}
                    onSelectEvent={handleSelectEvent}
                    onMoveEvent={handleMoveEvent}
                    onNewSession={handleOpenNewSession}
                    onNewEvent={handleOpenNewEvent}
                    onNewProject={() => setDialogOpen(true)}
                    onCreateEvents={handleCreateEvents}
                    onCreateStudySessions={handleCreateStudySessions}
                    onDeleteCalendarItems={handleDeleteCalendarItems}
                    onSetCalendarItemsCompleted={handleSetCalendarItemsCompleted}
                    onMergeEvents={handleMergeEvents}
              onMergeStudySessions={handleMergeStudySessions}
              onGoTimetable={handleSelectTimetable}
              timetableConfig={timetableConfig}
                  />
                ) : selectedProject ? (
                  <ProjectDetail
                    project={selectedProject}
                    sessions={sessions.filter((s) => s.projectId === selectedProject.id)}
                    onFilesChanged={refreshFileCounts}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onToggleFinished={handleToggleFinished}
                    onSelectSession={handleSelectSession}
                    onNewSession={() => handleOpenNewSession()}
                    onCreateEvents={handleCreateEvents}
                    onAddCustomSubfolder={addCustomSubfolder}
                    onRemoveCustomSubfolder={removeCustomSubfolder}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
                      <FolderOpen className="h-8 w-8 text-muted-foreground/25" />
                    </div>
                    <p className="mb-6 max-w-56 text-sm leading-relaxed text-muted-foreground">
                      Choose an assessment from the sidebar or create a new one to start organising your files.
                    </p>
                    <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
                      <FolderOpen className="h-4 w-4" />
                      New Assessment
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.main>
        </div>
        <ProjectDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleCreateProject}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
        />
        <StudySessionDialog
          key={selectedSession?.id ?? `new-session-${newItemDialogKey}`}
          open={sessionDialogOpen}
          onOpenChange={setSessionDialogOpen}
          projects={projects}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          session={selectedSession}
          initialDate={newItemInitialDate}
          onSubmit={selectedSession ? handleEditStudySession : handleCreateStudySession}
          onDelete={selectedSession ? handleDeleteStudySession : undefined}
        />
        <EventDialog
          key={`event-${selectedEvent?.id ?? `new-${newItemDialogKey}`}`}
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
          event={selectedEvent}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          initialDate={selectedEvent ? undefined : newItemInitialDate}
          onSubmit={(selectedEvent ? handleEditEvent : handleCreateEvent) as unknown as Parameters<typeof EventDialog>[0]["onSubmit"]}
          onSubmitMultiple={handleCreateEvents}
          onDelete={selectedEvent ? handleDeleteEvent : undefined}
        />
        <ProjectDialog
          project={selectedProject}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSubmitEdit={handleUpdateProject}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
        />
        <GlobalSearch
          projects={projects}
          sessions={sessions}
          events={events}
          onSelectProject={handleSelectProject}
          onSelectSession={handleSelectSession}
          onSelectEvent={handleSelectEvent}
          open={searchOpen}
          onOpenChange={setSearchOpen}
        />
        <DataExport
          projects={projects}
          sessions={sessions}
          events={events}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
        <CustomSubjects
          customSubjects={customSubjects}
          onSave={setCustomSubjects}
          open={subjectsOpen}
          onOpenChange={setSubjectsOpen}
        />
        <NotionConflictDialog
          open={notionConflictDialogOpen}
          onOpenChange={setNotionConflictDialogOpen}
          conflicts={notionConflicts}
          onResolve={handleResolveConflicts}
        />
        <Toaster
          className="focal-toaster"
          closeButton
          richColors
          duration={3500}
          visibleToasts={3}
          position="bottom-right"
          theme={resolvedDark ? "dark" : "light"}
        />
      </div>
      </MotionConfig>
    </TooltipProvider>
  )
}

export default App
