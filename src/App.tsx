import { useState, useCallback, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Toaster, toast } from "sonner"
import { FolderOpen } from "lucide-react"
import { Sidebar } from "@/components/Sidebar"
import { ProjectDetail } from "@/components/ProjectDetail"
import { NewProjectDialog } from "@/components/NewProjectDialog"
import { ProjectSettingsDialog } from "@/components/ProjectSettingsDialog"
import { useProjects } from "@/hooks/useProjects"
import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fileCounts, setFileCounts] = useState<Record<string, number>>({})
  const { dark, toggle: toggleDark } = useDarkMode()

  const selectedProject = projects.find((p) => p.id === selectedId) || null

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

  useEffect(() => {
    refreshFileCounts()
  }, [refreshFileCounts])

  const handleCreateProject = async (data: {
    name: string
    description?: string
    icon?: string
    deadline?: string
    subjectId?: string
    unit?: "1" | "2" | "3" | "4"
    deadlineType?: "sac" | "exam" | "assignment" | "gat"
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
      )
      setSelectedId(project.id)
      toast.success(`Project "${data.name}" created`)
    } catch (e) {
      toast.error(`Failed to create project: ${e}`)
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
    }
  ) => {
    try {
      await updateProject(id, data)
      toast.success(`Project updated`)
    } catch (e) {
      toast.error(`Failed to update project: ${e}`)
    }
  }

  const handleDeleteProject = async (id: string) => {
    try {
      const project = projects.find((p) => p.id === id)
      await deleteProject(id)
      if (selectedId === id) {
        setSelectedId(null)
      }
      toast.success(`Project "${project?.name}" deleted`)
    } catch (e) {
      toast.error(`Failed to delete project: ${e}`)
    }
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <div className="w-80 shrink-0">
          <Sidebar
            projects={projects}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDeleteProject}
            onNewProject={() => setDialogOpen(true)}
            fileCounts={fileCounts}
            dark={dark}
            onToggleDark={toggleDark}
          />
        </div>
        <main className="flex-1 overflow-auto">
          {selectedProject ? (
            <ProjectDetail
              project={selectedProject}
              onFilesChanged={refreshFileCounts}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="mb-8 w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">No project selected</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs leading-relaxed">
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
        />
        {selectedProject && (
          <ProjectSettingsDialog
            project={selectedProject}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            onSubmit={handleUpdateProject}
          />
        )}
        <Toaster />
      </div>
    </TooltipProvider>
  )
}

export default App
