import { useState, useCallback, useEffect, type MouseEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion"
import { Toaster, toast } from "sonner"
import { FolderOpen, Search, Settings } from "lucide-react"
import { Sidebar } from "@/components/Sidebar"
import { ProjectDetail } from "@/components/ProjectDetail"
import { HomeView } from "@/components/HomeView"
import { NewProjectDialog } from "@/components/NewProjectDialog"
import { NewStudySessionDialog } from "@/components/NewStudySessionDialog"
import { EditStudySessionDialog } from "@/components/EditStudySessionDialog"
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
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { CalendarEvent, ConfidenceScore, EventType, StudySession, StudySessionStatus, Subject } from "@/lib/types"

const MOTION_EASE = [0.16, 1, 0.3, 1] as const
const SHELL_LAYOUT_TRANSITION = { type: "spring", stiffness: 430, damping: 42, mass: 0.85 } as const
const VIEW_TRANSITION = { duration: 0.18, ease: MOTION_EASE } as const

function App() {
  const { projects, addProject, updateProject, deleteProject, addCustomSubfolder } = useProjects()
  const { sessions, addSession, addSessions, updateSession, deleteSession } = useStudySessions()
  const { events, addEvent, addEvents, updateEvent, deleteEvent } = useEvents()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [homeSelected, setHomeSelected] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [editSessionDialogOpen, setEditSessionDialogOpen] = useState(false)
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
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(() => {
    if (typeof window === "undefined") return []
    const stored = localStorage.getItem("focal-custom-subjects")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return stored ? JSON.parse(stored) : []
  })
  const { theme, mode, resolvedDark, setTheme, setMode } = useTheme()

  useEffect(() => {
    localStorage.setItem("focal-custom-subjects", JSON.stringify(customSubjects))
  }, [customSubjects])

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

  // Check for deadline notifications on app load and when projects change
  useDeadlineNotifications(projects, events)

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
    gatDate?: string
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
        data.gatDate,
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
      gatDate?: string
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
    if (!window.confirm(`Delete "${project.name}"? This will also delete all associated sessions.`)) return
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
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
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
    durationMinutes: number
    projectId?: string
  }) => {
    try {
      const start = new Date()
      const end = new Date(start.getTime() + data.durationMinutes * 60 * 1000)
      const session = await addSession(
        data.projectId,
        data.subjectIds,
        getPomodoroTitle(data.subjectIds),
        start.toISOString(),
        end.toISOString(),
        "Started from the Pomodoro timer.",
        undefined,
        "Focus block logged from the sidebar timer.",
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
    id: string
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
      setEditSessionDialogOpen(false)
      setSelectedSession(null)
    } catch (e) {
      toast.error(`Failed to update study session: ${String(e)}`)
    }
  }

  const handleDeleteStudySession = async (id: string) => {
    const session = sessions.find((s) => s.id === id)
    if (!session) return
    if (!window.confirm(`Delete "${session.title}"? This action cannot be undone.`)) return
    try {
      await deleteSession(id)
      toast.success("Study session deleted")
      setEditSessionDialogOpen(false)
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
    if (!window.confirm(`Delete "${event.title}"? This action cannot be undone.`)) return
    try {
      await deleteEvent(id)
      toast.success("Event deleted")
      setEditEventDialogOpen(false)
      setSelectedEvent(null)
    } catch (e) {
      toast.error(`Failed to delete event: ${String(e)}`)
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
    setEditSessionDialogOpen(true)
  }

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedEvent(event)
    setEditEventDialogOpen(true)
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
          <button
            onClick={() => setSearchOpen(true)}
            className="flex h-6 w-6 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background/55 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setSettingsView(true)}
            className="flex h-6 w-6 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-background/55 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
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
              customSubjects={customSubjects}
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
                    onOpenExport={() => setExportOpen(true)}
                    onOpenSubjects={() => setSubjectsOpen(true)}
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
        />
        <NewStudySessionDialog
          key={`new-session-${newItemDialogKey}`}
          open={sessionDialogOpen}
          onOpenChange={setSessionDialogOpen}
          projects={projects}
          customSubjects={customSubjects}
          initialDate={newItemInitialDate}
          onSubmit={handleCreateStudySession}
        />
        <EditStudySessionDialog
          open={editSessionDialogOpen}
          onOpenChange={setEditSessionDialogOpen}
          projects={projects}
          customSubjects={customSubjects}
          session={selectedSession}
          onSubmit={handleEditStudySession}
          onDelete={handleDeleteStudySession}
        />
        <NewEventDialog
          key={`new-event-${newItemDialogKey}`}
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
          customSubjects={customSubjects}
          initialDate={newItemInitialDate}
          onSubmit={handleCreateEvent}
        />
        <EditEventDialog
          open={editEventDialogOpen}
          onOpenChange={setEditEventDialogOpen}
          event={selectedEvent}
          customSubjects={customSubjects}
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
        <Toaster closeButton />
      </div>
      </MotionConfig>
    </TooltipProvider>
  )
}

export default App
