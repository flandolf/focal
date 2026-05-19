import { useState, useCallback, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Toaster, toast } from "sonner"
import { FolderOpen } from "lucide-react"
import { Sidebar } from "@/components/Sidebar"
import { ProjectDetail } from "@/components/ProjectDetail"
import { HomeView } from "@/components/HomeView"
import { NewProjectDialog } from "@/components/NewProjectDialog"
import { NewStudySessionDialog } from "@/components/NewStudySessionDialog"
import { EditStudySessionDialog } from "@/components/EditStudySessionDialog"
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog"
import { GlobalSearch } from "@/components/GlobalSearch"
import { DataExport } from "@/components/DataExport"
import { CustomSubjects } from "@/components/CustomSubjects"
import { SettingsDialog } from "@/components/SettingsDialog"
import { useProjects } from "@/hooks/useProjects"
import { useStudySessions } from "@/hooks/useStudySessions"
import { useDeadlineNotifications } from "@/hooks/useDeadlineNotifications"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { StudySession, Subject } from "@/lib/types"

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false
    const stored = localStorage.getItem("focal-dark")
    if (stored !== null) return stored === "true"
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })

  useEffect(() => {
    localStorage.setItem("focal-dark", String(dark))
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  return { dark, toggle: () => setDark((d) => !d) }
}

function App() {
  const { projects, addProject, updateProject, deleteProject } = useProjects()
  const { sessions, addSession, updateSession, deleteSession } = useStudySessions()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [homeSelected, setHomeSelected] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [editSessionDialogOpen, setEditSessionDialogOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<StudySession | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [customSubjects, setCustomSubjects] = useState<Subject[]>(() => {
    if (typeof window === "undefined") return []
    const stored = localStorage.getItem("focal-custom-subjects")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return stored ? JSON.parse(stored) : []
  })
  const { dark, toggle: toggleDark } = useDarkMode()

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
  useDeadlineNotifications(projects)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshFileCounts()
  }, [refreshFileCounts])

  const handleSelectProject = (id: string) => {
    setSelectedId(id)
    setHomeSelected(false)
  }

  const handleSelectHome = () => {
    setSelectedId(null)
    setHomeSelected(true)
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
    projectId: string
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
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
  }) => {
    try {
      await updateSession(data.id, {
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

  const handleSelectSession = (session: StudySession) => {
    setSelectedSession(session)
    setEditSessionDialogOpen(true)
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <div className="w-96 shrink-0">
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
            fileCounts={fileCounts}
            onOpenSettings={() => setAppSettingsOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenExport={() => setExportOpen(true)}
            onOpenSubjects={() => setSubjectsOpen(true)}
          />
        </div>
        <main className="flex-1 overflow-auto">
          {homeSelected ? (
            <HomeView
              projects={projects}
              sessions={sessions}
              onSelectProject={handleSelectProject}
              onSelectSession={handleSelectSession}
              onNewSession={() => setSessionDialogOpen(true)}
              onNewProject={() => setDialogOpen(true)}
            />
          ) : selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              sessions={sessions.filter((s) => s.projectId === selectedProject.id)}
              onFilesChanged={refreshFileCounts}
              onOpenSettings={() => setSettingsOpen(true)}
              onSelectSession={handleSelectSession}
              onNewSession={() => setSessionDialogOpen(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="mb-6 w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center">
                <FolderOpen className="h-8 w-8 text-muted-foreground/25" />
              </div>
              <p className="text-sm text-muted-foreground mb-6 max-w-56 leading-relaxed">
                Choose a project from the sidebar or create a new one to start organising your files.
              </p>
              <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
                <FolderOpen className="h-4 w-4" />
                New Project
              </Button>
            </div>
          )}
        </main>
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
          onSubmit={handleCreateStudySession}
        />
        <EditStudySessionDialog
          open={editSessionDialogOpen}
          onOpenChange={setEditSessionDialogOpen}
          projects={projects}
          session={selectedSession}
          onSubmit={handleEditStudySession}
          onDelete={handleDeleteStudySession}
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
          onSelectProject={handleSelectProject}
          onSelectSession={handleSelectSession}
          open={searchOpen}
          onOpenChange={setSearchOpen}
        />
        <DataExport
          projects={projects}
          sessions={sessions}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
        <CustomSubjects
          customSubjects={customSubjects}
          onSave={setCustomSubjects}
          open={subjectsOpen}
          onOpenChange={setSubjectsOpen}
        />
        <SettingsDialog
          open={appSettingsOpen}
          onOpenChange={setAppSettingsOpen}
          dark={dark}
          onToggleDark={toggleDark}
        />

        <Toaster />
      </div>
    </TooltipProvider>
  )
}

export default App
