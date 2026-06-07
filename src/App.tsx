import { useState, useCallback, useEffect, useMemo, type MouseEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion"
import { Toaster, toast } from "sonner"
import { FolderOpen, Search, Settings } from "lucide-react"
import { Sidebar } from "@/components/Sidebar"
import { ProjectDetail } from "@/components/ProjectDetail"
import { HomeView } from "@/components/HomeView"
import { NewProjectDialog } from "@/components/NewProjectDialog"
import { StudySessionDialog } from "@/components/StudySessionDialog"
import { NewEventDialog } from "@/components/NewEventDialog"
import { EditEventDialog } from "@/components/EditEventDialog"
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog"
import { GlobalSearch } from "@/components/GlobalSearch"
import { DataExport } from "@/components/DataExport"
import { CustomSubjects } from "@/components/CustomSubjects"
import { SettingsView } from "@/components/SettingsView"
import { AnalyticsView } from "@/components/analytics/AnalyticsView"
import { useProjects } from "@/hooks/useProjects"
import { useStudySessions } from "@/hooks/useStudySessions"
import { useEvents } from "@/hooks/useEvents"
import { useDeadlineNotifications } from "@/hooks/useDeadlineNotifications"
import { useTheme } from "@/lib/themes"
import { getSubjectById } from "@/lib/utils"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import { getNotionCalendarSettings } from "@/lib/settings"
import { syncNotionCalendar } from "@/lib/notionSync"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { VCE_SUBJECTS, type CalendarEvent, type ConfidenceScore, type EventType, type StudySession, type StudySessionStatus, type Subject } from "@/lib/types"

const MOTION_EASE = [0.16, 1, 0.3, 1] as const
const SHELL_LAYOUT_TRANSITION = { duration: 0.24, ease: MOTION_EASE } as const
const VIEW_TRANSITION = { duration: 0.18, ease: MOTION_EASE } as const
const POMODORO_MERGE_WINDOW_MS = 15 * 60 * 1000
const POMODORO_DESCRIPTION = "Started from the Pomodoro timer."
const POMODORO_NOTES = "Focus block logged from the sidebar timer."
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

function isPomodoroSession(session: StudySession) {
  return session.description === POMODORO_DESCRIPTION || session.notes === POMODORO_NOTES
}

function haveSameSubjects(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, index) => id === sortedB[index])
}

function getUniqueStrings(items: (string | undefined)[]) {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))))
}

function getUniqueArrayItems(items: (string[] | undefined)[]) {
  return Array.from(new Set(items.flatMap((item) => item ?? []).map((item) => item.trim()).filter(Boolean)))
}

function isMergeablePomodoroSession(session: StudySession, data: { projectId?: string; subjectIds: string[] }) {
  return isPomodoroSession(session)
    && session.projectId === data.projectId
    && haveSameSubjects(session.subjectIds, data.subjectIds)
}

function getAdjacentPomodoroSession(
  sessions: StudySession[],
  data: { projectId?: string; subjectIds: string[] },
  start: Date,
  end: Date,
) {
  const startMs = start.getTime()
  const endMs = end.getTime()

  const adjacentSessions = sessions
    .filter((session) => isMergeablePomodoroSession(session, data))
    .map((session) => ({
      session,
      startMs: new Date(session.startTime).getTime(),
      endMs: new Date(session.endTime).getTime(),
    }))
    .filter(({ startMs: candidateStartMs, endMs: candidateEndMs }) => (
      Number.isFinite(candidateStartMs)
      && Number.isFinite(candidateEndMs)
      && (
        Math.abs(startMs - candidateEndMs) <= POMODORO_MERGE_WINDOW_MS
        || Math.abs(candidateStartMs - endMs) <= POMODORO_MERGE_WINDOW_MS
      )
    ))
    .sort((a, b) => Math.min(Math.abs(startMs - a.endMs), Math.abs(endMs - a.startMs)) - Math.min(Math.abs(startMs - b.endMs), Math.abs(endMs - b.startMs)))

  return adjacentSessions[0]?.session
}

function App() {
  const { projects, addProject, updateProject, deleteProject, addCustomSubfolder } = useProjects()
  const { sessions, addSession, addSessions, updateSession, updateSessions, deleteSession, deleteSessions, updateAndDeleteSessions } = useStudySessions()
  const { events, addEvent, addEvents, updateEvent, updateEvents, deleteEvent, deleteEvents, updateAndDeleteEvents, syncEvents } = useEvents()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [homeSelected, setHomeSelected] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<StudySession | null>(null)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [editEventDialogOpen, setEditEventDialogOpen] = useState(false)
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
  const reduceMotion = useReducedMotion()
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(getStoredCustomSubjects)
  const [hiddenSubjectIds, setHiddenSubjectIds] = useState<string[]>(getStoredHiddenSubjectIds)
  const { theme, mode, resolvedDark, setTheme, setMode } = useTheme()
  const allSubjects = useMemo(() => [...VCE_SUBJECTS, ...customSubjects], [customSubjects])
  const availableSubjects = useMemo(
    () => allSubjects.filter((subject) => !hiddenSubjectIds.includes(subject.id)),
    [allSubjects, hiddenSubjectIds],
  )

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

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
    setAnalyticsView(false)
  }

  const handleSelectAnalytics = () => {
    setSelectedId(null)
    setHomeSelected(false)
    setSettingsView(false)
    setAnalyticsView(true)
  }

  const handleOpenNewSession = (initialDate?: Date) => {
    setSelectedSession(null)
    setNewItemInitialDate(initialDate)
    setNewItemDialogKey((key) => key + 1)
    setSessionDialogOpen(true)
  }

  const handleOpenNewEvent = (initialDate?: Date) => {
    setNewItemInitialDate(initialDate)
    setNewItemDialogKey((key) => key + 1)
    setEventDialogOpen(true)
  }

  const handleCreateProject = async (data: {
    name: string
    description?: string
    icon?: string
    deadline?: string
    subjectId?: string
    unit?: "1" | "2" | "3" | "4"
    deadlineType?: "sac" | "exam" | "assignment" | "gat"
    examDate?: string
  }) => {
    try {
      const project = await addProject(
        data.name,
        data.description,
        data.icon,
        data.deadline,
        data.subjectId,
        data.unit,
        data.deadlineType,
        data.examDate,
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
      deadline?: string
      subjectId?: string
      unit?: "1" | "2" | "3" | "4"
      deadlineType?: "sac" | "exam" | "assignment" | "gat"
      examDate?: string
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
      toast.success(`Assessment "${project.name}" deleted`)
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
      await addSession(
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
    } catch (e) {
      toast.error(`Failed to create study sessions: ${String(e)}`)
      throw e
    }
  }

  const getPomodoroTitle = (subjectIds: string[]) => {
    const labels = subjectIds
      .map((id) => getSubjectById(id)?.shortCode ?? getSubjectById(id)?.name)
      .filter((label): label is string => Boolean(label))

    if (labels.length === 0) return "Pomodoro focus"
    if (labels.length === 1) return `${labels[0]} focus`
    return `${labels.slice(0, 2).join(" + ")} focus`
  }

  const handleStartPomodoroSession = async (data: {
    subjectIds: string[]
    durationSeconds: number
    projectId?: string
  }) => {
    try {
      const start = new Date()
      const end = new Date(start.getTime() + data.durationSeconds * 1000)
      const adjacentSession = getAdjacentPomodoroSession(sessions, data, start, end)

      if (adjacentSession) {
        const mergedStart = new Date(Math.min(new Date(adjacentSession.startTime).getTime(), start.getTime()))
        const mergedEnd = new Date(Math.max(new Date(adjacentSession.endTime).getTime(), end.getTime()))
        const mergedSession: StudySession = {
          ...adjacentSession,
          startTime: mergedStart.toISOString(),
          endTime: mergedEnd.toISOString(),
          status: "in-progress",
          completedAt: undefined,
        }

        await updateSession(adjacentSession.id, {
          startTime: mergedSession.startTime,
          endTime: mergedSession.endTime,
          status: mergedSession.status,
          completedAt: mergedSession.completedAt,
        })
        toast.success("Pomodoro session merged on calendar")
        return mergedSession
      }

      const session = await addSession(
        data.projectId,
        data.subjectIds,
        getPomodoroTitle(data.subjectIds),
        start.toISOString(),
        end.toISOString(),
        POMODORO_DESCRIPTION,
        undefined,
        POMODORO_NOTES,
        "in-progress",
      )
      toast.success("Pomodoro session added to calendar")
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
      await updateSession(id, updates)
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
      toast.success("Study session deleted")
      setSessionDialogOpen(false)
      setSelectedSession(null)
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
      await addEvent(data)
      toast.success(`Event "${data.title}" added`)
      setEventDialogOpen(false)
    } catch (e) {
      toast.error(`Failed to add event: ${String(e)}`)
    }
  }

  const handleCreateEvents = async (items: Omit<CalendarEvent, "id" | "created_at">[]) => {
    try {
      await addEvents(items)
      toast.success(`${items.length} event${items.length !== 1 ? "s" : ""} added`)
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
      setEditEventDialogOpen(false)
      setSelectedEvent(null)
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
      toast.success("Event deleted")
      setEditEventDialogOpen(false)
      setSelectedEvent(null)
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
    try {
      await Promise.all([
        itemIds.eventIds.length > 0 ? deleteEvents(itemIds.eventIds) : Promise.resolve(),
        itemIds.sessionIds.length > 0 ? deleteSessions(itemIds.sessionIds) : Promise.resolve(),
      ])
      toast.success(`${total} calendar item${total === 1 ? "" : "s"} deleted`)
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
      toast.success(`${selectedEvents.length} events merged`)
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
      toast.success(`${selectedSessions.length} study sessions merged`)
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
    setEditEventDialogOpen(true)
  }

  const handleSyncNotionCalendar = async () => {
    try {
      const result = await syncNotionCalendar(getNotionCalendarSettings(), events, allSubjects)
      if (result.updated.length > 0 || result.created.length > 0) {
        await syncEvents(result.created, result.updated)
      }
      const pulled = result.created.length + result.updated.length
      const pushed = result.pushedCreated + result.pushedUpdated
      toast.success(
        pulled > 0 || pushed > 0
          ? `Synced Notion calendar: ${pulled} pulled, ${pushed} pushed`
          : "Notion calendar already up to date",
      )
      if (result.skipped > 0) {
        toast.info(`${result.skipped} Notion item${result.skipped === 1 ? "" : "s"} skipped without a valid date`, {
          description: result.skippedReasons[0],
        })
      }
      return result
    } catch (e) {
      toast.error(`Notion sync failed: ${String(e)}`)
      throw e
    }
  }

  const handleTitlebarDrag = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail > 1) return
    void getCurrentWindow().startDragging().catch(() => undefined)
  }

  const contentKey = settingsView ? "settings" : analyticsView ? "analytics" : homeSelected ? "home" : selectedProject ? `project-${selectedProject.id}` : "empty"
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
        </div>
        <div className="hairline-grid pointer-events-none absolute inset-0 opacity-80" />
        <div
          className="relative z-10 flex h-full gap-2 min-[1200px]:gap-3"
        >
          <motion.div
            layout
            className="min-h-0 shrink-0"
            style={{ width: sidebarCollapsed ? "4.5rem" : "clamp(13rem, 28vw, 21rem)" }}
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
              fileCounts={fileCounts}
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
                    onNewSession={handleOpenNewSession}
                    onNewEvent={handleOpenNewEvent}
                    onNewProject={() => setDialogOpen(true)}
                    onCreateEvents={handleCreateEvents}
                    onCreateStudySessions={handleCreateStudySessions}
                    onDeleteCalendarItems={handleDeleteCalendarItems}
                    onSetCalendarItemsCompleted={handleSetCalendarItemsCompleted}
                    onMergeEvents={handleMergeEvents}
                    onMergeStudySessions={handleMergeStudySessions}
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
        <NewProjectDialog
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
        <NewEventDialog
          key={`new-event-${newItemDialogKey}`}
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          initialDate={newItemInitialDate}
          onSubmit={handleCreateEvent}
        />
        <EditEventDialog
          open={editEventDialogOpen}
          onOpenChange={setEditEventDialogOpen}
          event={selectedEvent}
          customSubjects={customSubjects}
          availableSubjects={availableSubjects}
          onSubmit={handleEditEvent}
          onDelete={handleDeleteEvent}
        />
        {selectedProject && (
          <ProjectSettingsDialog
            project={selectedProject}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            onSubmit={handleUpdateProject}
            customSubjects={customSubjects}
            availableSubjects={availableSubjects}
          />
        )}
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
