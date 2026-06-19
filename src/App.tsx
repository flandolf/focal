import { lazy, Suspense, memo, useState, useCallback, useEffect, useMemo, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { platform } from "@tauri-apps/plugin-os"
import { downloadDir } from "@tauri-apps/api/path"
import { open } from "@tauri-apps/plugin-dialog"
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion"
import { MOTION_DURATION, MOTION_EASE, REDUCED_TRANSITION, pressable as pressableMotion, staggerContainer, staggerItem } from "@/lib/motion"
import { Toaster, toast } from "sonner"
import { FolderOpen, Loader2 } from "lucide-react"
import { useProjects, type ProjectSortKey } from "@/hooks/useProjects"
import { useProjectsDirectoryWatcher } from "@/hooks/useProjectsDirectoryWatcher"
import { useStudySessions } from "@/hooks/useStudySessions"
import { useEvents } from "@/hooks/useEvents"
import { useDeadlineNotifications } from "@/hooks/useDeadlineNotifications"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useNotionSync } from "@/hooks/useNotionSync"
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth"
import { useSupabaseSync } from "@/hooks/useSupabaseSync"
import { useTheme } from "@/lib/themes"
import { confirmDestructiveAction, confirmAction } from "@/lib/confirmToast"
import { showUndoToast } from "@/lib/undoToast"
import { sanitiseFolderName } from "@/lib/utils"
import { getNotionCalendarSettings, getTimetableConfig, getProjectsRootPath } from "@/lib/settings"
import { isPomodoroSession, getPomodoroDescription, getPomodoroNotes, getPomodoroTitle, POMODORO_DESCRIPTION_PREFIX, getAdjacentPomodoroSession, getUniqueStrings, getUniqueArrayItems } from "@/lib/pomodoro"
import { deleteNotionPage } from "@/lib/notion/api"
import { recordLocalSoftDelete, recordLocalUpsert, forcePushAndMerge, forcePushAndOverwrite, pullNow, pushNow, clearFailedItems, retryFailedItem, dropQueueItem, resolveConflictAcceptRemote, resolveConflictKeepLocal, dismissConflict, clearConflicts } from "@/lib/sync/engine"
import type { SyncTable } from "@/lib/sync/types"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { Sidebar } from "@/components/Sidebar"
import { TitleBar } from "@/components/TitleBar"
import { ProjectDetail } from "@/components/ProjectDetail"
import { HomeView } from "@/components/HomeView"
import { ProjectDialog } from "@/components/ProjectDialog"
import { ProjectTemplateDialog } from "@/components/ProjectTemplateDialog"
import { StudySessionDialog } from "@/components/StudySessionDialog"
import { EventDialog } from "@/components/EventDialog"
import { GlobalSearch } from "@/components/GlobalSearch"
import { DataExport } from "@/components/DataExport"
import { CustomSubjects } from "@/components/CustomSubjects"
import { NotionConflictDialog } from "@/components/NotionConflictDialog"
import { NotionSyncIndicator } from "@/components/NotionSyncIndicator"
import { SupabaseSyncIndicator } from "@/components/SupabaseSyncIndicator"
import { AIAssistantPanel } from "@/components/AIAssistantPanel"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import { VCE_SUBJECTS, type CalendarEvent, type ConfidenceScore, type EventType, type StudySession, type StudySessionStatus, type Subject } from "@/lib/types"
import type { ProjectTemplate } from "@/lib/types"

const TimetableView = lazy(() =>
  import("@/components/timetable/TimetableView").then((m) => ({ default: m.TimetableView })),
)
const SettingsView = lazy(() =>
  import("@/components/SettingsView").then((m) => ({ default: m.SettingsView })),
)
const AnalyticsView = lazy(() =>
  import("@/components/analytics/AnalyticsView").then((m) => ({ default: m.AnalyticsView })),
)

function ViewFallback({ label }: { label?: string }) {
  const reduceMotion = useReducedMotion() === true
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ? `Loading ${label}` : "Loading"}
      className="flex h-full items-center justify-center px-6"
    >
      <motion.div
        className="glass-panel flex w-full max-w-xs flex-col items-center gap-5 overflow-hidden rounded-2xl p-8"
        variants={staggerContainer(0.05, 0.06)}
        initial="initial"
        animate="animate"
      >
        {/* Spinner icon */}
        <motion.div
          variants={staggerItem}
          className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/30"
        >
          <motion.div
            animate={reduceMotion ? undefined : { rotate: 360 }}
            transition={reduceMotion ? REDUCED_TRANSITION : { duration: 2.5, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="h-5 w-5 text-muted-foreground/40" aria-hidden />
          </motion.div>
        </motion.div>

        {/* Skeleton bars */}
        <motion.div variants={staggerItem} className="flex w-full flex-col gap-2.5">
          <motion.div
            className="h-3 w-2/5 rounded-md bg-muted/40"
            animate={reduceMotion ? undefined : { opacity: [0.4, 0.8, 0.4] }}
            transition={reduceMotion ? REDUCED_TRANSITION : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="h-2.5 w-full rounded-md bg-muted/30"
            animate={reduceMotion ? undefined : { opacity: [0.3, 0.65, 0.3] }}
            transition={reduceMotion ? REDUCED_TRANSITION : { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.12 }}
          />
          <motion.div
            className="h-2.5 w-5/6 rounded-md bg-muted/25"
            animate={reduceMotion ? undefined : { opacity: [0.25, 0.55, 0.25] }}
            transition={reduceMotion ? REDUCED_TRANSITION : { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 0.24 }}
          />
        </motion.div>

        {/* Label */}
        {label && (
          <motion.span
            variants={staggerItem}
            className="text-caption text-muted-foreground/60"
          >
            Loading {label}…
          </motion.span>
        )}
      </motion.div>
    </div>
  )
}

const SHELL_LAYOUT_TRANSITION = { duration: 0.24, ease: MOTION_EASE } as const
const VIEW_TRANSITION = { duration: 0.18, ease: MOTION_EASE } as const
const EMPTY_STATE_TRANSITION = { duration: MOTION_DURATION.slow, ease: MOTION_EASE } as const
const HIDDEN_SUBJECTS_STORAGE_KEY = "focal-hidden-subjects"

interface NotionSource {
  type: string
  id?: string
}

/** Delete a Notion page if the item has a linked Notion source. */
async function deleteNotionPageIfLinked(source: NotionSource | undefined) {
  if (source?.type !== "notion" || !source.id) return
  const settings = getNotionCalendarSettings()
  if (!settings.token.trim() || !settings.dataSourceId.trim()) return
  try {
    await deleteNotionPage(settings, source.id)
  } catch (e) {
    console.error("Failed to delete Notion page:", e)
    toast.error("Failed to delete from Notion — it may reappear on next sync")
  }
}

/** Delete multiple Notion pages in parallel, collecting failures. */
async function deleteNotionPagesIfLinked(sources: (NotionSource | undefined)[], silent = false) {
  const settings = getNotionCalendarSettings()
  const canDelete = settings.token.trim() && settings.dataSourceId.trim()
  if (!canDelete) return
  const pageIds = sources
    .filter((s): s is NotionSource => s?.type === "notion" && Boolean(s.id))
    .map((s) => s.id!)
  if (pageIds.length === 0) return
  const failedIds: string[] = []
  await Promise.allSettled(
    pageIds.map((pageId) =>
      deleteNotionPage(settings, pageId).catch(() => {
        failedIds.push(pageId)
      })
    )
  )
  if (!silent && failedIds.length > 0) {
    toast.error(`${failedIds.length} item${failedIds.length === 1 ? "" : "s"} failed to delete from Notion — they may reappear on next sync`)
  }
}

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

try {
  if (platform() !== "macos") document.documentElement.classList.add("non-macos")
} catch {
  /* Tauri runtime not available (dev/browser) */
}

function App() {
  const [projectsRoot, setProjectsRoot] = useState(() => getProjectsRootPath())

  // Initialize projects directory override from localStorage on startup
  useEffect(() => {
    if (projectsRoot) {
      invoke("set_projects_directory", { path: projectsRoot }).catch((e) => {
        console.error("Failed to set projects directory:", e)
        toast.warning("Your saved projects folder could not be loaded. It may have been moved or deleted.")
      })
    }
  }, [projectsRoot])

  useProjectsDirectoryWatcher(projectsRoot)

  const { projects, addProject, updateProject, renameProjectFolder, changeProjectFolder, deleteProject, restoreProject, duplicateProject, bulkArchive, bulkUnarchive, bulkFinish, bulkDelete, addChecklistItem, toggleChecklistItem, removeChecklistItem, addDependency, removeDependency, getTemplates, saveAsTemplate, deleteTemplate, loadFromTemplate, scanAndImportProjects, linkFolderAsProject } = useProjects()
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
  const prevFileCountsRef = useRef<Record<string, number>>({})
  const [bumpProjectIds, setBumpProjectIds] = useState<Set<string>>(new Set())
  const bumpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)
  const [settingsView, setSettingsView] = useState(false)
  const [analyticsView, setAnalyticsView] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [timetableView, setTimetableView] = useState(false)
  const [sidebarSortKey, setSidebarSortKey] = useState<ProjectSortKey>("deadline")
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set())
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templateSaveProjectId, setTemplateSaveProjectId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ProjectTemplate[]>(() => getTemplates())
  const [timetableConfig, setTimetableConfig] = useState(getTimetableConfig)
  const [zoom, setZoom] = useState(() => {
    try {
      const stored = localStorage.getItem("focal-app-scale")
      const parsed = stored ? parseFloat(stored) : 1
      return Number.isFinite(parsed) && parsed >= 0.5 && parsed <= 2 ? parsed : 1
    } catch { return 1 }
  })

  // Persist zoom to localStorage and apply natively via Tauri webview zoom
  useEffect(() => {
    localStorage.setItem("focal-app-scale", String(zoom))
    invoke("window_set_zoom", { scale: zoom }).catch(() => {
      // Tauri not available (dev/browser mode)
    })
  }, [zoom])

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.1, 1.5))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.1, 0.75))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
  }, [])

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
  const supabaseAuth = useSupabaseAuth()
  const supabaseSync = useSupabaseSync(supabaseAuth.session)
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
    performNotionSync,
    requestNotionSync,
    pushEventChange,
    pushSessionChange,
    resolveConflicts,
  } = useNotionSync({ events, sessions, allSubjects, syncEvents, syncSessions })

  useEffect(() => {
    localStorage.setItem("focal-custom-subjects", JSON.stringify(customSubjects))
  }, [customSubjects])

  useEffect(() => {
    localStorage.setItem(HIDDEN_SUBJECTS_STORAGE_KEY, JSON.stringify(hiddenSubjectIds))
  }, [hiddenSubjectIds])

  const suppressCustomSubjectSyncRef = useRef(false)
  const suppressHiddenSubjectSyncRef = useRef(false)
  const suppressTimetableSyncRef = useRef(false)

  useEffect(() => {
    const handler = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table
      if (table === "custom_subjects") {
        suppressCustomSubjectSyncRef.current = true
        setCustomSubjects(getStoredCustomSubjects())
      }
      if (table === "hidden_subjects") {
        suppressHiddenSubjectSyncRef.current = true
        setHiddenSubjectIds(getStoredHiddenSubjectIds())
      }
      if (table === "timetable_config") {
        suppressTimetableSyncRef.current = true
        setTimetableConfig(getTimetableConfig())
      }
    }
    window.addEventListener("focal-sync-data-changed", handler)
    return () => window.removeEventListener("focal-sync-data-changed", handler)
  }, [])

  const previousCustomSubjectIdsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const previous = previousCustomSubjectIdsRef.current
    const currentIds = new Set(customSubjects.map((subject) => subject.id))
    if (suppressCustomSubjectSyncRef.current) {
      suppressCustomSubjectSyncRef.current = false
      previousCustomSubjectIdsRef.current = currentIds
      return
    }
    if (previous) {
      customSubjects.forEach((subject) => void recordLocalUpsert("custom_subjects", subject))
      previous.forEach((subjectId) => {
        if (!currentIds.has(subjectId)) void recordLocalSoftDelete("custom_subjects", subjectId)
      })
    }
    previousCustomSubjectIdsRef.current = currentIds
  }, [customSubjects])

  const previousHiddenSubjectIdsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const previous = previousHiddenSubjectIdsRef.current
    const currentIds = new Set(hiddenSubjectIds)
    if (suppressHiddenSubjectSyncRef.current) {
      suppressHiddenSubjectSyncRef.current = false
      previousHiddenSubjectIdsRef.current = currentIds
      return
    }
    if (previous) {
      hiddenSubjectIds.forEach((subjectId) => void recordLocalUpsert("hidden_subjects", subjectId))
      previous.forEach((subjectId) => {
        if (!currentIds.has(subjectId)) void recordLocalSoftDelete("hidden_subjects", subjectId)
      })
    }
    previousHiddenSubjectIdsRef.current = currentIds
  }, [hiddenSubjectIds])

  const timetableSyncReadyRef = useRef(false)
  useEffect(() => {
    if (!timetableSyncReadyRef.current) {
      timetableSyncReadyRef.current = true
      return
    }
    if (suppressTimetableSyncRef.current) {
      suppressTimetableSyncRef.current = false
      return
    }
    void recordLocalUpsert("timetable_config", timetableConfig)
  }, [timetableConfig])

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
  const selectedProjectSessions = useMemo(() =>
    selectedProject ? sessions.filter((s) => s.projectId === selectedProject.id) : [],
    [sessions, selectedProject]
  )

  const refreshFileCounts = useCallback(async () => {
    const results = await Promise.allSettled(
      projects.map((project) =>
        invoke<number>("get_project_file_count", { projectName: project.folder_path })
          .then((count) => ({ id: project.id, count }))
      )
    )
    const counts: Record<string, number> = {}
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      if (result.status === "fulfilled") {
        counts[result.value.id] = result.value.count
      } else {
        counts[projects[i].id] = 0
      }
    }
    const bumps = new Set<string>()
    for (const [id, count] of Object.entries(counts)) {
      const prev = prevFileCountsRef.current[id]
      if (prev !== undefined && prev !== count) {
        bumps.add(id)
      }
    }
    prevFileCountsRef.current = counts
    setFileCounts(counts)
    if (bumps.size > 0) {
      setBumpProjectIds(bumps)
      if (bumpTimeoutRef.current) clearTimeout(bumpTimeoutRef.current)
      bumpTimeoutRef.current = setTimeout(() => {
        bumpTimeoutRef.current = null
        setBumpProjectIds(new Set())
      }, 500)
    }
  }, [projects])

  const projectCountTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const refreshFileCountForProject = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return
    try {
      const count = await invoke<number>("get_project_file_count", { projectName: project.folder_path })
      const prev = prevFileCountsRef.current[projectId]
      prevFileCountsRef.current = { ...prevFileCountsRef.current, [projectId]: count }
      setFileCounts((prevCounts) => ({ ...prevCounts, [projectId]: count }))
      if (prev !== undefined && prev !== count) {
        setBumpProjectIds((prevBumps) => {
          const next = new Set(prevBumps)
          next.add(projectId)
          return next
        })
        if (bumpTimeoutRef.current) clearTimeout(bumpTimeoutRef.current)
        bumpTimeoutRef.current = setTimeout(() => {
          bumpTimeoutRef.current = null
          setBumpProjectIds(new Set())
        }, 500)
      }
    } catch (e) {
      console.error(`Failed to refresh file count for project ${projectId}:`, e)
    }
  }, [projects])

  const debouncedRefreshFileCountForProject = useCallback((projectId: string) => {
    if (projectCountTimeoutsRef.current[projectId]) {
      clearTimeout(projectCountTimeoutsRef.current[projectId])
    }
    projectCountTimeoutsRef.current[projectId] = setTimeout(() => {
      delete projectCountTimeoutsRef.current[projectId]
      void refreshFileCountForProject(projectId)
    }, 200)
  }, [refreshFileCountForProject])

  // Check for timely study notifications on app load and when planning data changes
  useDeadlineNotifications(projects, events, sessions)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshFileCounts()
  }, [refreshFileCounts])

  const handleSelectProject = useCallback((id: string) => {
    setSelectedId(id)
    setHomeSelected(false)
    setSettingsView(false)
    setAnalyticsView(false)
    setTimetableView(false)
  }, [])

  const handleSelectHome = useCallback(() => {
    setSelectedId(null)
    setHomeSelected(true)
    setSettingsView(false)
    setTimetableView(false)
    setAnalyticsView(false)
  }, [])

  const handleSelectTimetable = useCallback(() => {
    setSelectedId(null)
    setHomeSelected(false)
    setSettingsView(false)
    setAnalyticsView(false)
    setTimetableView(true)
  }, [])

  const handleSelectAnalytics = useCallback(() => {
    setSelectedId(null)
    setHomeSelected(false)
    setSettingsView(false)
    setTimetableView(false)
    setAnalyticsView(true)
  }, [])

  const handleOpenNewSession = useCallback((initialDate?: Date) => {
    setSelectedSession(null)
    setNewItemInitialDate(initialDate)
    setNewItemDialogKey((key) => key + 1)
    setSessionDialogOpen(true)
  }, [])

  const handleOpenNewEvent = useCallback((initialDate?: Date) => {
    setSelectedEvent(null)
    setNewItemInitialDate(initialDate)
    setNewItemDialogKey((key) => key + 1)
    setEventDialogOpen(true)
  }, [])

  useKeyboardShortcuts({
    onSearch: () => setSearchOpen(true),
    onNewAssessment: () => setDialogOpen(true),
    onNewEvent: () => handleOpenNewEvent(),
    onNewSession: () => handleOpenNewSession(),
    onGoHome: handleSelectHome,
    onGoTimetable: handleSelectTimetable,
    onGoAnalytics: handleSelectAnalytics,
    onToggleSidebar: () => setSidebarCollapsed((prev) => !prev),
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onZoomReset: handleZoomReset,
  })

  const handleOpenAiAssistant = useCallback(() => setAiAssistantOpen(true), [])

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
        projectName: project.folder_path,
      })
      await refreshFileCountForProject(projectId)
      toast.success(`Added ${selected.length} file${selected.length === 1 ? "" : "s"} to ${project.name}`)
    } catch {
      toast.error("Failed to add files")
    }
  }, [projects, refreshFileCountForProject])
  const handleResolveConflicts = useCallback((resolutions: Record<string, "local" | "notion" | "skip">) => {
    void resolveConflicts(resolutions)
  }, [resolveConflicts])

  const handleCreateProject = useCallback(async (data: {
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
  }, [addProject, setSelectedId, setHomeSelected])

  const handleUpdateProject = useCallback(async (
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
    const project = projects.find((p) => p.id === id)
    const nameChanged = project && data.name !== project.name

    try {
      await updateProject(id, data)
      toast.success(`Assessment updated`)

      if (nameChanged && project) {
        const sanitised = sanitiseFolderName(data.name)
        if (sanitised && sanitised !== project.folder_path) {
          const confirmed = await confirmAction({
            title: `Rename folder to "${sanitised}"?`,
            description: `The folder on disk is currently "${project.folder_path}".`,
            actionLabel: "Rename",
            cancelLabel: "Keep",
            duration: 15000,
          })
          if (confirmed) {
            try {
              await renameProjectFolder(id, data.name)
              toast.success("Folder renamed")
            } catch (e) {
              toast.error(`Failed to rename folder: ${String(e)}`)
            }
          }
        }
      }
    } catch (e) {
      toast.error(`Failed to update assessment: ${String(e)}`)
    }
  }, [projects, updateProject, renameProjectFolder])

  const handleDeleteProject = useCallback(async (id: string) => {
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
  }, [projects, deleteProject, selectedId, restoreProject, requestNotionSync])

  const handleCreateStudySession = useCallback(async (data: {
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
    activeDurations?: { start: string; end: string }[]
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
        data.status,
        data.activeDurations,
      )
      toast.success(`Study session "${data.title}" created`)
      setSessionDialogOpen(false)
      void pushSessionChange(newSession)
    } catch (e) {
      toast.error(`Failed to create study session: ${String(e)}`)
    }
  }, [addSession, pushSessionChange, setSessionDialogOpen])

  const handleCreateStudySessions = useCallback(async (items: {
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
  }, [addSessions, requestNotionSync])

  const handleStartPomodoroSession = useCallback(async (data: {
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
  }, [sessions, projects, addSession, updateSession, pushSessionChange])

  const handleUpdatePomodoroSession = useCallback(async (
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
  }, [sessions, projects, updateSession, pushSessionChange])

  const handleEditStudySession = useCallback(async (data: {
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
    activeDurations?: { start: string; end: string }[]
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
        activeDurations: data.activeDurations,
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
  }, [sessions, updateSession, pushSessionChange, setSessionDialogOpen, setSelectedSession])

  const handleDeleteStudySession = useCallback(async (id: string) => {
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
      void deleteNotionPageIfLinked(session.source)
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
  }, [sessions, deleteSession, restoreSession, setSessionDialogOpen, setSelectedSession, requestNotionSync])

  const handleCreateEvent = useCallback(async (data: {
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
  }, [addEvent, pushEventChange, setEventDialogOpen])

  const handleCreateEvents = useCallback(async (items: Omit<CalendarEvent, "id" | "created_at">[]) => {
    try {
      await addEvents(items)
      toast.success(`${items.length} event${items.length !== 1 ? "s" : ""} added`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to add events: ${String(e)}`)
      throw e
    }
  }, [addEvents, requestNotionSync])

  const handleEditEvent = useCallback(async (data: {
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
  }, [updateEvent, events, pushEventChange, setEventDialogOpen, setSelectedEvent])

  const handleDeleteEvent = useCallback(async (id: string) => {
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
      void deleteNotionPageIfLinked(event.source)
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
  }, [events, deleteEvent, restoreEvent, setEventDialogOpen, setSelectedEvent, requestNotionSync])

  const handleDeleteCalendarItems = useCallback(async (itemIds: { eventIds: string[]; sessionIds: string[] }) => {
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
      // Delete Notion pages for sourced items in parallel
      await deleteNotionPagesIfLinked([
        ...deletedEvents.map((e) => e.source),
        ...deletedSessions.map((s) => s.source),
      ])

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
  }, [events, sessions, deleteEvents, deleteSessions, restoreEvents, restoreSessions, requestNotionSync])

  const handleSetCalendarItemsCompleted = useCallback(async (itemIds: { eventIds: string[]; sessionIds: string[] }, isCompleted: boolean) => {
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
  }, [updateEvents, updateSessions, requestNotionSync])

  const handleMergeEvents = useCallback(async (ids: string[]) => {
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
      void deleteNotionPagesIfLinked(selectedEvents.slice(1).map((e) => e.source), true)

      toast.success(`${selectedEvents.length} events merged`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to merge events: ${String(e)}`)
      throw e
    }
  }, [events, updateAndDeleteEvents, requestNotionSync])

  const handleMergeStudySessions = useCallback(async (ids: string[]) => {
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
      void deleteNotionPagesIfLinked(selectedSessions.slice(1).map((s) => s.source), true)

      toast.success(`${selectedSessions.length} study sessions merged`)
      void requestNotionSync(false)
    } catch (e) {
      toast.error(`Failed to merge study sessions: ${String(e)}`)
      throw e
    }
  }, [sessions, updateAndDeleteSessions, requestNotionSync])

  const handleToggleFavorite = useCallback(async (id: string) => {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    try {
      await updateProject(id, { isFavorite: !project.isFavorite })
    } catch (e) {
      toast.error(`Failed to update assessment: ${String(e)}`)
    }
  }, [projects, updateProject])

  const handleToggleArchive = useCallback(async (id: string) => {
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
  }, [projects, updateProject, setSelectedId, setHomeSelected])

  const handleToggleFinished = useCallback(async (id: string) => {
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
  }, [projects, updateProject])

  const handleSelectSession = useCallback((session: StudySession) => {
    setSelectedSession(session)
    setSessionDialogOpen(true)
  }, [setSelectedSession, setSessionDialogOpen])

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event)
    setEventDialogOpen(true)
  }, [setSelectedEvent, setEventDialogOpen])

  const handleMoveEvent = useCallback((eventId: string, newStartTime: string, newEndTime?: string) => {
    const updates: Partial<Omit<CalendarEvent, "id" | "created_at">> = { startTime: newStartTime }
    if (newEndTime) {
      updates.endTime = newEndTime
    }
    void updateEvent(eventId, updates)
  }, [updateEvent])

  const handleSyncNotionCalendar = useCallback(async (onProgress: (msg: string) => void) => {
    return performNotionSync(true, onProgress)
  }, [performNotionSync])

  const handleNewProject = useCallback(() => {
    setDialogOpen(true)
  }, [])

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const handleOpenProjectSettings = useCallback((id: string) => {
    setSelectedId(id)
    setHomeSelected(false)
    setSettingsView(false)
    setAnalyticsView(false)
    setTimetableView(false)
    setSettingsOpen(true)
  }, [])

  const handleDropFolder = useCallback(async (path: string) => {
    try {
      const result = await invoke<{ folder_path: string; is_linked: boolean }>("handle_folder_drop", { sourcePath: path })
      const existingPaths = new Set(projects.map((p) => p.folder_path))
      if (existingPaths.has(result.folder_path)) {
        toast.error(`A project for "${result.folder_path}" already exists`)
        return
      }
      const project = await addProject(
        result.folder_path,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        result.folder_path,
        result.is_linked,
      )
      setSelectedId(project.id)
      setHomeSelected(false)
      setSettingsView(false)
      setAnalyticsView(false)
      setTimetableView(false)
      toast.success(result.is_linked ? `Linked "${result.folder_path}"` : `Imported "${result.folder_path}"`)
    } catch (e) {
      toast.error(`Failed to drop folder: ${String(e)}`)
    }
  }, [projects, addProject])

  // New project management handlers
  const handleDuplicateProject = useCallback(async (id: string) => {
    try {
      const copy = await duplicateProject(id)
      setSelectedId(copy.id)
      setHomeSelected(false)
      toast.success(`Duplicated as "${copy.name}"`)
    } catch (e) {
      toast.error(`Failed to duplicate: ${String(e)}`)
    }
  }, [duplicateProject])

  const handleToggleProjectSelection = useCallback((id: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleBulkArchive = useCallback(async (ids: string[]) => {
    try {
      await bulkArchive(ids)
      setSelectedProjectIds(new Set())
      toast.success(`${ids.length} assessment${ids.length > 1 ? "s" : ""} archived`)
    } catch (e) {
      toast.error(`Failed to archive: ${String(e)}`)
    }
  }, [bulkArchive])

  const handleBulkUnarchive = useCallback(async (ids: string[]) => {
    try {
      await bulkUnarchive(ids)
      setSelectedProjectIds(new Set())
      toast.success(`${ids.length} assessment${ids.length > 1 ? "s" : ""} restored`)
    } catch (e) {
      toast.error(`Failed to restore: ${String(e)}`)
    }
  }, [bulkUnarchive])

  const handleBulkFinish = useCallback(async (ids: string[]) => {
    try {
      await bulkFinish(ids)
      setSelectedProjectIds(new Set())
      toast.success(`${ids.length} assessment${ids.length > 1 ? "s" : ""} marked complete`)
    } catch (e) {
      toast.error(`Failed to update: ${String(e)}`)
    }
  }, [bulkFinish])

  const handleBulkDelete = useCallback(async (ids: string[]) => {
    const confirmed = await confirmDestructiveAction({
      title: `Delete ${ids.length} assessment${ids.length > 1 ? "s" : ""}?`,
      description: "This also removes associated study sessions.",
      actionLabel: "Delete",
    })
    if (!confirmed) return
    try {
      await bulkDelete(ids)
      setSelectedProjectIds(new Set())
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null)
        setHomeSelected(true)
      }
      toast.success(`${ids.length} assessment${ids.length > 1 ? "s" : ""} deleted`)
    } catch (e) {
      toast.error(`Failed to delete: ${String(e)}`)
    }
  }, [bulkDelete, selectedId])

  const handleUpdateNotes = useCallback(async (notes: string) => {
    if (!selectedId) return
    try {
      await updateProject(selectedId, { notes: notes || undefined })
    } catch (e) {
      toast.error(`Failed to update notes: ${String(e)}`)
    }
  }, [selectedId, updateProject])

  const handleAddChecklistItem = useCallback(async (text: string) => {
    if (!selectedId) return
    try {
      await addChecklistItem(selectedId, text)
    } catch (e) {
      toast.error(`Failed to add task: ${String(e)}`)
    }
  }, [selectedId, addChecklistItem])

  const handleToggleChecklistItem = useCallback(async (itemId: string) => {
    if (!selectedId) return
    try {
      await toggleChecklistItem(selectedId, itemId)
    } catch (e) {
      toast.error(`Failed to update task: ${String(e)}`)
    }
  }, [selectedId, toggleChecklistItem])

  const handleRemoveChecklistItem = useCallback(async (itemId: string) => {
    if (!selectedId) return
    try {
      await removeChecklistItem(selectedId, itemId)
    } catch (e) {
      toast.error(`Failed to remove task: ${String(e)}`)
    }
  }, [selectedId, removeChecklistItem])

  const handleAddDependency = useCallback(async (dependsOnId: string) => {
    if (!selectedId) return
    try {
      await addDependency(selectedId, dependsOnId)
    } catch (e) {
      toast.error(`Failed to add dependency: ${String(e)}`)
    }
  }, [selectedId, addDependency])

  const handleRemoveDependency = useCallback(async (dependsOnId: string) => {
    if (!selectedId) return
    try {
      await removeDependency(selectedId, dependsOnId)
    } catch (e) {
      toast.error(`Failed to remove dependency: ${String(e)}`)
    }
  }, [selectedId, removeDependency])

  const handleSaveAsTemplate = useCallback((projectId: string | null, name: string) => {
    if (!projectId) return
    try {
      saveAsTemplate(projectId, name)
      setTemplates(getTemplates())
      toast.success(`Template "${name}" saved`)
    } catch (e) {
      toast.error(`Failed to save template: ${String(e)}`)
    }
  }, [saveAsTemplate, getTemplates])

  const handleDeleteTemplate = useCallback((templateId: string) => {
    deleteTemplate(templateId)
    setTemplates(getTemplates())
  }, [deleteTemplate, getTemplates])

  const handleLoadTemplate = useCallback(async (templateId: string) => {
    try {
      const project = await loadFromTemplate(templateId)
      setSelectedId(project.id)
      setHomeSelected(false)
      toast.success(`Created "${project.name}" from template`)
    } catch (e) {
      toast.error(`Failed to load template: ${String(e)}`)
    }
  }, [loadFromTemplate])

  const handleOpenTemplateDialog = useCallback((projectId?: string) => {
    setTemplates(getTemplates())
    setTemplateSaveProjectId(projectId ?? null)
    setTemplateDialogOpen(true)
  }, [getTemplates])

  const handleExportProject = useCallback(() => {
    if (!selectedProject) return
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        assessment: selectedProject,
        sessions: selectedProjectSessions,
      }
      const content = JSON.stringify(data, null, 2)
      const blob = new Blob([content], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `focal-${selectedProject.name.replace(/[^a-zA-Z0-9]/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Project exported")
    } catch (e) {
      toast.error(`Failed to export: ${String(e)}`)
    }
  }, [selectedProject, selectedProjectSessions])

  const handleChangeProjectFolder = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    const selected = await open({
      directory: true,
      multiple: false,
    })
    if (!selected || typeof selected !== "string") return

    try {
      const folderPath = await invoke<string>("link_folder_as_project", { sourcePath: selected })
      const existingPaths = new Set(projects.map((p) => p.folder_path))
      if (existingPaths.has(folderPath) && folderPath !== project.folder_path) {
        toast.error(`A project for "${folderPath}" already exists`)
        return
      }
      await changeProjectFolder(projectId, folderPath)
      toast.success(`Folder changed to "${folderPath}"`)
    } catch (e) {
      toast.error(`Failed to change folder: ${String(e)}`)
    }
  }, [projects, changeProjectFolder])

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  const contentKey = settingsView ? "settings" : analyticsView ? "analytics" : timetableView ? "timetable" : homeSelected ? "home" : selectedProject ? `project-${selectedProject.id}` : "empty"
  const layoutTransition = reduceMotion ? { duration: 0 } : SHELL_LAYOUT_TRANSITION
  const viewTransition = reduceMotion ? { duration: 0 } : VIEW_TRANSITION

  return (
    <TooltipProvider>
      <MotionConfig reducedMotion="user">
      <ErrorBoundary>
      <div className="focal-shell relative flex h-full flex-col overflow-hidden text-foreground">
        <TitleBar
          onSearch={() => setSearchOpen(true)}
          onSettings={() => setSettingsView(true)}
        >
          <NotionSyncIndicator
            status={syncStatus}
            lastSyncTime={lastSyncTime}
            onClick={() => requestNotionSync(true)}
            disabled={syncStatus === "syncing"}
          />
          <SupabaseSyncIndicator
            sync={supabaseSync}
            signedIn={Boolean(supabaseAuth.user)}
          />
        </TitleBar>
        <div className="hairline-grid pointer-events-none absolute inset-0 z-0 opacity-80" />
        <div className="ambient-shell pointer-events-none absolute inset-0 z-0 opacity-60" />
        <div className="relative z-10 flex min-h-0 flex-1 gap-2 px-2 pb-2 min-[1200px]:gap-3 min-[1200px]:px-3 min-[1200px]:pb-3">
          <motion.div
            layout
            className="min-h-0 h-full shrink-0"
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
              onToggleCollapse={handleToggleCollapse}
              onSelect={handleSelectProject}
              onSelectHome={handleSelectHome}
              onSelectAnalytics={handleSelectAnalytics}
              onDelete={handleDeleteProject}
              onNewProject={handleNewProject}
              onToggleFavorite={handleToggleFavorite}
              onToggleArchive={handleToggleArchive}
              onToggleFinished={handleToggleFinished}
              onStartPomodoroSession={handleStartPomodoroSession}
              onUpdatePomodoroSession={handleUpdatePomodoroSession}
              onDeletePomodoroSession={handleDeleteStudySession}
              onAddFile={handleAddFileFromSidebar}
              onOpenProjectSettings={handleOpenProjectSettings}
              onDuplicateProject={handleDuplicateProject}
              onDropFolder={handleDropFolder}
              fileCounts={fileCounts}
              bumpProjectIds={bumpProjectIds}
              onSelectTimetable={handleSelectTimetable}
              timetableSelected={timetableView}
              onSearch={() => setSearchOpen(true)}
              onSettings={() => setSettingsView(true)}
              sortKey={sidebarSortKey}
              onSortChange={setSidebarSortKey}
              selectedProjectIds={selectedProjectIds}
              onToggleProjectSelection={handleToggleProjectSelection}
              onBulkArchive={handleBulkArchive}
              onBulkUnarchive={handleBulkUnarchive}
              onBulkFinish={handleBulkFinish}
              onBulkDelete={handleBulkDelete}
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
                  <Suspense fallback={<ViewFallback label="settings" />}>
                  <SettingsView
                    onBack={() => setSettingsView(false)}
                    theme={theme}
                    mode={mode}
                    resolvedDark={resolvedDark}
                    setTheme={setTheme}
                    setMode={setMode}
                    zoom={zoom}
                    onZoomChange={(v) => setZoom(v)}
                    subjects={allSubjects}
                    hiddenSubjectIds={hiddenSubjectIds}
                    onToggleSubjectVisibility={handleToggleSubjectVisibility}
                    onShowAllSubjects={handleShowAllSubjects}
                    onOpenExport={() => setExportOpen(true)}
                    onOpenSubjects={() => setSubjectsOpen(true)}
                    onSyncNotionCalendar={handleSyncNotionCalendar}
                    lastSyncTime={lastSyncTime}
                    projects={projects}
                    onFilesChanged={refreshFileCounts}
                    supabaseConfigured={supabaseAuth.configured}
                    supabaseEmail={supabaseAuth.user?.email}
                    supabaseLoading={supabaseAuth.loading}
                    supabaseError={supabaseAuth.error}
                    supabaseSync={supabaseSync}
                    onSupabaseSignIn={supabaseAuth.signIn}
                    onSupabaseSignUp={supabaseAuth.signUp}
                    onSupabaseSignOut={supabaseAuth.signOut}
                    onForcePushAndMerge={() => void forcePushAndMerge()}
                    onForcePushAndOverwrite={() => void forcePushAndOverwrite()}
                    onPullNow={() => void pullNow()}
                    onPushNow={() => void pushNow()}
                    onClearFailedItems={() => clearFailedItems()}
                    onRetryFailedItem={(table, rowId) => { void retryFailedItem(table as SyncTable, rowId) }}
                    onDropFailedItem={(table, rowId) => { void dropQueueItem(table as SyncTable, rowId) }}
                    onAcceptRemote={(table, rowId) => { void resolveConflictAcceptRemote(table as SyncTable, rowId) }}
                    onKeepLocal={(table, rowId) => { void resolveConflictKeepLocal(table as SyncTable, rowId) }}
                    onDismissConflict={(table, rowId) => { dismissConflict(table as SyncTable, rowId) }}
                    onClearConflicts={() => clearConflicts()}
                    onProjectsRootChanged={() => {
                      setProjectsRoot(getProjectsRootPath())
                      void refreshFileCounts()
                    }}
                    onScanAndImportProjects={scanAndImportProjects}
                    onLinkFolderAsProject={linkFolderAsProject}
                  />
                  </Suspense>
                ) : timetableView ? (
                  <Suspense fallback={<ViewFallback label="timetable" />}>
                  <TimetableView
                    customSubjects={customSubjects}
                  />
                  </Suspense>
                ) : analyticsView ? (
                  <Suspense fallback={<ViewFallback label="analytics" />}>
                  <AnalyticsView
                    sessions={sessions}
                    projects={projects}
                    onNewSession={handleOpenNewSession}
                  />
                  </Suspense>
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
                    onNewProject={handleNewProject}
                    onCreateEvents={handleCreateEvents}
                    onCreateStudySessions={handleCreateStudySessions}
                    onDeleteCalendarItems={handleDeleteCalendarItems}
                    onSetCalendarItemsCompleted={handleSetCalendarItemsCompleted}
                    onMergeEvents={handleMergeEvents}
              onMergeStudySessions={handleMergeStudySessions}
              onGoTimetable={handleSelectTimetable}
                    timetableConfig={timetableConfig}
                    onOpenAiAssistant={handleOpenAiAssistant}
                  />
                ) : selectedProject ? (
                  <ProjectDetail
                    project={selectedProject}
                    sessions={selectedProjectSessions}
                    onFilesChanged={() => debouncedRefreshFileCountForProject(selectedProject.id)}
                    onOpenSettings={handleOpenSettings}
                    onToggleFinished={handleToggleFinished}
                    onSelectSession={handleSelectSession}
                    onNewSession={handleOpenNewSession}
                    onUpdateNotes={handleUpdateNotes}
                    onAddChecklistItem={handleAddChecklistItem}
                    onToggleChecklistItem={handleToggleChecklistItem}
                    onRemoveChecklistItem={handleRemoveChecklistItem}
                    onAddDependency={handleAddDependency}
                    onRemoveDependency={handleRemoveDependency}
                    onOpenProject={handleSelectProject}
                    availableProjects={projects}
                    onExport={handleExportProject}
                    onSaveAsTemplate={() => handleOpenTemplateDialog(selectedProject.id)}
                  />
                ) : (
                  <motion.div
                    className="flex h-full flex-col items-center justify-center px-8 text-center"
                    variants={staggerContainer(0.08, 0.1)}
                    initial="initial"
                    animate="animate"
                  >
                    <motion.div
                      variants={staggerItem}
                      transition={EMPTY_STATE_TRANSITION}
                      className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30"
                    >
                      <motion.div
                        animate={reduceMotion ? undefined : { y: [0, -3, 0] }}
                        transition={reduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <FolderOpen className="h-8 w-8 text-muted-foreground/25" />
                      </motion.div>
                    </motion.div>
                    <motion.p
                      variants={staggerItem}
                      transition={EMPTY_STATE_TRANSITION}
                      className="mb-6 max-w-56 text-sm leading-relaxed text-muted-foreground"
                    >
                      Choose an assessment from the sidebar or create a new one to start organising your files.
                    </motion.p>
                    <motion.div variants={staggerItem} transition={EMPTY_STATE_TRANSITION}>
                      <Button
                        onClick={handleNewProject}
                        size="sm"
                        className="gap-1.5"
                        {...pressableMotion(reduceMotion)}
                      >
                        <FolderOpen className="h-4 w-4" />
                        New Assessment
                      </Button>
                    </motion.div>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.main>
          <AIAssistantPanel open={aiAssistantOpen} onOpenChange={setAiAssistantOpen} />
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
          onChangeFolder={handleChangeProjectFolder}
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
          onNewProject={handleNewProject}
          onNewSession={() => handleOpenNewSession()}
          onNewEvent={() => handleOpenNewEvent()}
          onGoHome={handleSelectHome}
          onGoTimetable={handleSelectTimetable}
          onGoAnalytics={handleSelectAnalytics}
          onOpenAiAssistant={handleOpenAiAssistant}
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
        <ProjectTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          templates={templates}
          onSaveAsTemplate={handleSaveAsTemplate}
          onLoadTemplate={handleLoadTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          projectIdForSave={templateSaveProjectId}
          projectNameForSave={templateSaveProjectId ? projects.find((p) => p.id === templateSaveProjectId)?.name : undefined}
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
      </ErrorBoundary>
      </MotionConfig>
    </TooltipProvider>
  )
}

export default memo(App)
