import { useState, useCallback, useEffect, type MouseEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"
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
import { useProjects } from "@/hooks/useProjects"
import { useStudySessions } from "@/hooks/useStudySessions"
import { useEvents } from "@/hooks/useEvents"
import { useDeadlineNotifications } from "@/hooks/useDeadlineNotifications"
import { useTheme } from "@/lib/themes"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { CalendarEvent, EventType, StudySession, Subject } from "@/lib/types"

function App() {
  const { projects, addProject, updateProject, deleteProject } = useProjects()
  const { sessions, addSession, updateSession, deleteSession } = useStudySessions()
  const { events, addEvent, updateEvent, deleteEvent } = useEvents()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [homeSelected, setHomeSelected] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [editSessionDialogOpen, setEditSessionDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<StudySession | null>(null)
  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [editEventDialogOpen, setEditEventDialogOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const [settingsView, setSettingsView] = useState(false)
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(() => {
    if (typeof window === "undefined") return []
    const stored = localStorage.getItem("focal-custom-subjects")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return stored ? JSON.parse(stored) : []
  })
  const { theme, dark, setTheme, toggleDark } = useTheme()

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
  }

  const handleSelectHome = () => {
    setSelectedId(null)
    setHomeSelected(true)
    setSettingsView(false)
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
      toast.success(`Project "${data.name}" created`)
    } catch (e) {
      toast.error(`Failed to create project: ${String(e)}`)
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
      toast.success(`Project updated`)
    } catch (e) {
      toast.error(`Failed to update project: ${String(e)}`)
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
      toast.success(`Project "${project.name}" deleted`)
    } catch (e) {
      toast.error(`Failed to delete project: ${String(e)}`)
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
  }) => {
    try {
      await updateSession(data.id, {
        projectId: data.projectId,
        subjectIds: data.subjectIds,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        description: data.description,
        topics: data.topics,
        notes: data.notes,
      })
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
  }) => {
    try {
      await addEvent(data)
      toast.success(`Event "${data.title}" added`)
      setEventDialogOpen(false)
    } catch (e) {
      toast.error(`Failed to add event: ${String(e)}`)
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
      toast.error(`Failed to update project: ${String(e)}`)
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
      toast.error(`Failed to update project: ${String(e)}`)
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
        toast.success(`"${project.name}" marked as active`)
      }
    } catch (e) {
      toast.error(`Failed to update project: ${String(e)}`)
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

  return (
    <TooltipProvider>
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
        <div className="pointer-events-none absolute inset-x-8 top-(--app-titlebar-inset) h-px bg-foreground/10" />
        <div
          className="relative z-10 grid h-full gap-2 min-[1200px]:gap-3"
          style={{ gridTemplateColumns: "clamp(13rem, 28vw, 21rem) minmax(0, 1fr)" }}
        >
          <div className="min-h-0">
            <Sidebar
              projects={projects}
              selectedId={selectedId}
              homeSelected={homeSelected}
              onSelect={handleSelectProject}
              onSelectHome={handleSelectHome}
              onDelete={handleDeleteProject}
              onNewProject={() => setDialogOpen(true)}
              onToggleFavorite={handleToggleFavorite}
              onToggleArchive={handleToggleArchive}
              onToggleFinished={handleToggleFinished}
              fileCounts={fileCounts}
              onOpenExport={() => setExportOpen(true)}
              onOpenSubjects={() => setSubjectsOpen(true)}
            />
          </div>
          <main className="glass-panel min-w-0 overflow-hidden rounded-2xl min-[1200px]:rounded-[1.35rem]">
            {settingsView ? (
              <SettingsView
                onBack={() => setSettingsView(false)}
                theme={theme}
                dark={dark}
                onSetTheme={setTheme}
                onToggleDark={toggleDark}
              />
            ) : homeSelected ? (
              <HomeView
                projects={projects}
                sessions={sessions}
                events={events}
                onSelectProject={handleSelectProject}
                onSelectSession={handleSelectSession}
                onSelectEvent={handleSelectEvent}
                onNewSession={() => setSessionDialogOpen(true)}
                onNewEvent={() => setEventDialogOpen(true)}
                onNewProject={() => setDialogOpen(true)}
              />
            ) : selectedProject ? (
              <ProjectDetail
                project={selectedProject}
                sessions={sessions.filter((s) => s.projectId === selectedProject.id)}
                onFilesChanged={refreshFileCounts}
                onOpenSettings={() => setSettingsOpen(true)}
                onToggleFinished={handleToggleFinished}
                onSelectSession={handleSelectSession}
                onNewSession={() => setSessionDialogOpen(true)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
                  <FolderOpen className="h-8 w-8 text-muted-foreground/25" />
                </div>
                <p className="mb-6 max-w-56 text-sm leading-relaxed text-muted-foreground">
                  Choose a project from the sidebar or create a new one to start organising your files.
                </p>
                <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
                  <FolderOpen className="h-4 w-4" />
                  New Project
                </Button>
              </div>
            )}
          </main>
        </div>
        <NewProjectDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSubmit={handleCreateProject}
          customSubjects={customSubjects}
        />
        <NewStudySessionDialog
          open={sessionDialogOpen}
          onOpenChange={setSessionDialogOpen}
          projects={projects}
          customSubjects={customSubjects}
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
          open={eventDialogOpen}
          onOpenChange={setEventDialogOpen}
          customSubjects={customSubjects}
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
        <Toaster />
      </div>
    </TooltipProvider>
  )
}

export default App
