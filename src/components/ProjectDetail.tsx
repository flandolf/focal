import { useEffect, useState, useCallback } from "react"
import { FolderOpen, Plus, FolderUp, Loader2, Settings, Folder, Search, X, Trash2, Clock, Calendar, CheckCircle2 } from "lucide-react"
import { format, parseISO } from "date-fns"
import { openPath } from "@tauri-apps/plugin-opener"
import { homeDir } from "@tauri-apps/api/path"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { FileRow } from "@/components/FileRow"
import { AutoRenameButton } from "@/components/AutoRenameButton"
import { useProjectFiles } from "@/hooks/useProjectFiles"
import { formatDeadline, isOverdue, getSubjectById, getDeadlineTypeInfo, getSessionSubjectIds } from "@/lib/utils"
import { DEFAULT_SUBFOLDERS, type FileTag } from "@/lib/types"
import type { Project, FileInfo, StudySession } from "@/lib/types"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { cn } from "@/lib/utils"

interface ProjectDetailProps {
  project: Project
  sessions: StudySession[]
  onFilesChanged: () => void
  onOpenSettings: () => void
  onToggleFinished?: (id: string) => void
  onSelectSession?: (session: StudySession) => void
  onNewSession?: () => void
}

export function ProjectDetail({ project, sessions, onFilesChanged, onOpenSettings, onToggleFinished, onSelectSession, onNewSession }: ProjectDetailProps) {
  const { files, loading, loadFiles, addFiles, renameFile, deleteFiles } = useProjectFiles(project.folder_path)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTags, setSelectedTags] = useState<FileTag[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"files" | "sessions">("files")

  useEffect(() => {
    void loadFiles(selectedSubfolder)
  }, [project.id, selectedSubfolder, loadFiles])

  useEffect(() => {
    if (!loading) {
      onFilesChanged()
    }
  }, [files, loading, onFilesChanged])

  useEffect(() => {
    let unlisten: UnlistenFn | undefined

    const setup = async () => {
      try {
        unlisten = await getCurrentWebviewWindow().onDragDropEvent((event) => {
          const payload = event.payload

          switch (payload.type) {
            case "enter":
            case "over":
              setIsDragging(true)
              break
            case "drop":
              setIsDragging(false)
              if (payload.paths.length > 0) {
                const targetFolder = selectedSubfolder 
                  ? `${project.folder_path}/${selectedSubfolder}`
                  : project.folder_path
                invoke("move_files_to_project", {
                  files: payload.paths,
                  projectName: targetFolder,
                })
                  .then(() => {
                    void loadFiles(selectedSubfolder)
                    onFilesChanged()
                  })
                  .catch((e) => {
                    console.error("Failed to move dropped files:", e)
                  })
              }
              break
            case "leave":
              setIsDragging(false)
              break
          }
        })
      } catch (e) {
        console.error("Failed to setup drag-drop listener:", e)
      }
    }

    void setup()

    return () => {
      unlisten?.()
    }
  }, [project.folder_path, selectedSubfolder, loadFiles, onFilesChanged])

  const handleAddFiles = async () => {
    const count = await addFiles(selectedSubfolder)
    if (count) {
      onFilesChanged()
    }
  }

  const handleOpenFolder = async () => {
    try {
      const home = await homeDir()
      const folderPath = selectedSubfolder
        ? `${home}/Documents/Projects/${project.folder_path}/${selectedSubfolder}`
        : `${home}/Documents/Projects/${project.folder_path}`
      await openPath(folderPath)
    } catch (e) {
      console.error("Failed to open folder:", e)
    }
  }

  const handleOpenFile = async (file: { path: string }) => {
    try {
      await openPath(file.path)
    } catch (e) {
      console.error("Failed to open file:", e)
    }
  }

  const handleRenameFile = async (file: FileInfo, newName: string) => {
    try {
      await renameFile(file.path, newName)
      onFilesChanged()
    } catch (e) {
      console.error("Failed to rename file:", e)
    }
  }


  const handleApplyAutoRenames = useCallback(
    async (renames: { filePath: string; newName: string }[]) => {
      for (const { filePath, newName } of renames) {
        try {
          await renameFile(filePath, newName)
        } catch (e) {
          console.error(`Failed to rename ${filePath}:`, e)
        }
      }
      onFilesChanged()
    },
    [renameFile, onFilesChanged],
  )

  const filteredFiles = files.filter((file) => {
    if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    if (selectedTags.length > 0) {
      const fileTags = file.tags ?? (file.tag ? [file.tag] : [])
      return selectedTags.some(tag => fileTags.includes(tag))
    }
    return true
  })

  const handleFileSelectionChange = (file: FileInfo, selected: boolean) => {
    const newSelected = new Set(selectedFiles)
    if (selected) {
      newSelected.add(file.path)
    } else {
      newSelected.delete(file.path)
    }
    setSelectedFiles(newSelected)
  }

  const handleSelectAll = () => {
    const allPaths = new Set(filteredFiles.map(f => f.path))
    setSelectedFiles(allPaths)
  }

  const handleClearSelection = () => {
    setSelectedFiles(new Set())
  }

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return
    if (!window.confirm(`Delete ${selectedFiles.size} file${selectedFiles.size > 1 ? "s" : ""}? This cannot be undone.`)) return
    const paths = Array.from(selectedFiles)
    try {
      await deleteFiles(paths)
      setSelectedFiles(new Set())
      onFilesChanged()
    } catch (e) {
      console.error("Batch delete failed:", e)
    }
  }

  const subject = getSubjectById(project.subjectId)
  const deadlineInfo = getDeadlineTypeInfo(project.deadlineType)

  return (
    <div className="relative flex h-full flex-col">
      {isDragging && (
        <div className="absolute inset-4 z-modal-backdrop flex items-center justify-center rounded-[1.25rem] border border-primary/20 bg-background/80 backdrop-blur-md pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Plus className="h-7 w-7 text-primary/60" />
            </div>
            <p className="text-sm font-medium text-primary/70">Drop files here</p>
          </div>
        </div>
      )}

      <div className="border-b border-border/70 px-5 pb-4 pt-5 min-[1200px]:px-8 min-[1200px]:pb-5 min-[1200px]:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex min-w-0 items-center gap-2.5 min-[1200px]:gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background/45 text-lg leading-none shadow-sm min-[1200px]:h-11 min-[1200px]:w-11 min-[1200px]:rounded-2xl min-[1200px]:text-xl">
                {project.icon ?? "📄"}
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-heading text-xl font-semibold min-[1200px]:text-2xl">{project.name}</h2>
                <p className="truncate text-caption text-muted-foreground font-mono">
                  ~/Documents/Projects/{project.folder_path}{selectedSubfolder ? `/${selectedSubfolder}` : ""}
                </p>
              </div>
              {project.isFinished && (
                <span className="flex items-center gap-1 rounded-lg bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Finished
                </span>
              )}
              {project.unit && (
                <span className="rounded-lg bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Unit {project.unit}
                </span>
              )}
            </div>
            {project.description && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{project.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {subject && (
                <span
                  className="flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: subject.color + "14",
                    color: subject.color
                  }}
                >
                  {subject.icon} {subject.name}
                </span>
              )}
              {project.deadline && (
                <Badge
                  variant={isOverdue(project.deadline) ? "destructive" : "secondary"}
                  className="gap-1 font-normal"
                  style={project.deadlineType ? {
                    backgroundColor: deadlineInfo.color + "14",
                    color: deadlineInfo.color,
                    border: 'none',
                  } : undefined}
                >
                  {deadlineInfo.icon} {formatDeadline(project.deadline)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onOpenSettings}>
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Settings</TooltipContent>
            </Tooltip>
            {onToggleFinished && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl"
                    onClick={() => onToggleFinished(project.id)}
                  >
                    <CheckCircle2 className={cn("h-4 w-4", project.isFinished && "text-green-500")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {project.isFinished ? "Mark as active" : "Mark as complete"}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleOpenFolder} className="h-8 gap-1.5 rounded-xl bg-background/45">
                  <FolderUp className="h-4 w-4" />
                  <span className="max-[950px]:hidden">Open Folder</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in Finder</TooltipContent>
            </Tooltip>
            <Button size="sm" onClick={handleAddFiles} className="h-8 gap-1.5 rounded-xl">
              <Plus className="h-4 w-4" />
              <span>Add Files</span>
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-2xl border border-border/70 bg-background/35 p-1">
            <button
              onClick={() => setViewMode("files")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors",
                viewMode === "files"
                  ? "bg-background/80 text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Folder className="h-3.5 w-3.5" />
              Files
            </button>
            <button
              onClick={() => setViewMode("sessions")}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors",
                viewMode === "sessions"
                  ? "bg-background/80 text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              Sessions
              {sessions.length > 0 && (
                <span className="tabular-nums text-micro">{sessions.length}</span>
              )}
            </button>
          </div>

          {viewMode === "files" && (
            <div className="flex min-w-0 max-w-full flex-1 items-center gap-1 overflow-x-auto rounded-2xl bg-background/20 p-1">
              <button
                onClick={() => setSelectedSubfolder(null)}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors",
                  selectedSubfolder === null
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Folder className="h-3.5 w-3.5" />
                All
              </button>
              {DEFAULT_SUBFOLDERS.map((folder) => (
                <button
                  key={folder}
                  onClick={() => setSelectedSubfolder(selectedSubfolder === folder ? null : folder)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors",
                    selectedSubfolder === folder
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <Folder className="h-3.5 w-3.5" />
                  {folder}
                </button>
              ))}
            </div>
          )}

          <div className="min-w-4 flex-1" />
          {viewMode === "sessions" && onNewSession && (
            <Button size="sm" onClick={onNewSession} className="h-7 gap-1.5 rounded-xl text-xs">
              <Plus className="h-3.5 w-3.5" />
              New Session
            </Button>
          )}
        </div>

        {viewMode === "files" && files.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 rounded-xl bg-background/45 pl-8 text-xs"
              />
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="h-7 w-7 p-0"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <div className="mx-1 h-4 w-px bg-border" />
            {(["sac", "notes", "past-paper", "exam", "resource"] as FileTag[]).map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTags(
                  selectedTags.includes(tag)
                    ? selectedTags.filter(t => t !== tag)
                    : [...selectedTags, tag]
                )}
                className={cn(
                  "px-2 py-0.5 text-caption rounded transition-colors",
                  selectedTags.includes(tag)
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="text-caption text-muted-foreground hover:text-foreground px-1.5 py-0.5"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {viewMode === "sessions" ? (
          <SessionsView
            sessions={sessions}
            project={project}
            projectName={project.name}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
          />
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 text-center min-[1200px]:px-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background/35">
              <FolderOpen className="h-6 w-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No files yet</p>
            <p className="text-xs text-muted-foreground mb-5 max-w-56 leading-relaxed">
              Drag and drop files here, or select them from your computer.
            </p>
            <Button variant="secondary" size="sm" onClick={handleAddFiles} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Files
            </Button>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-[1rem_2rem_minmax(0,1fr)_5rem] items-center gap-3 border-b border-border/70 bg-background/18 px-5 py-2 text-caption font-medium uppercase tracking-wider text-muted-foreground/60 min-[1000px]:grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_3.5rem] min-[1200px]:px-8">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span>Name</span>
              <span className="text-right">Size</span>
              <span className="hidden text-right min-[1000px]:block">Type</span>
            </div>

            {/* Selection bar */}
            {selectedFiles.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-accent/20 px-5 py-2.5 min-[1200px]:gap-3 min-[1200px]:px-8">
                <span className="text-xs font-medium">{selectedFiles.size} selected</span>
                <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-7 px-2 text-xs">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearSelection} className="h-7 px-2 text-xs">
                  Clear
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDeleteSelected}
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
              </div>
            )}

            <ScrollArea className="min-h-0 flex-1">
              <div className="divide-y divide-border/70">
                {filteredFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    onOpen={handleOpenFile}
                    onRename={handleRenameFile}
                    isSelected={selectedFiles.has(file.path)}
                    onSelectionChange={handleFileSelectionChange}
                  />
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {viewMode === "files" && files.length > 0 && (
        <AutoRenameButton
          files={filteredFiles}
          onApplyRenames={handleApplyAutoRenames}
        />
      )}
    </div>
  )
}

function SessionsView({
  sessions,
  project,
  projectName,
  onSelectSession,
  onNewSession,
}: {
  sessions: StudySession[]
  project: Project
  projectName: string
  onSelectSession?: (session: StudySession) => void
  onNewSession?: () => void
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-5 min-[1200px]:px-8">
        <div className="mb-5 w-12 h-12 rounded-xl bg-muted/40 flex items-center justify-center">
          <Clock className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No study sessions</p>
        <p className="text-xs text-muted-foreground mb-5 max-w-56 leading-relaxed">
          Plan study sessions for {projectName} to track your revision time and progress.
        </p>
        {onNewSession && (
          <Button variant="secondary" size="sm" onClick={onNewSession} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Plan Session
          </Button>
        )}
      </div>
    )
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  )

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-2 px-5 py-4 min-[1200px]:px-8">
        {sorted.map((session) => {
          const start = parseISO(session.startTime)
          const end = parseISO(session.endTime)
          const durationMs = end.getTime() - start.getTime()
          const hours = Math.floor(durationMs / (1000 * 60 * 60))
          const minutes = Math.round((durationMs % (1000 * 60 * 60)) / (1000 * 60))
          const sessionSubjects = getSessionSubjectIds(session, project)

          return (
            <button
              key={session.id}
              onClick={() => onSelectSession?.(session)}
              className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/30 transition-colors group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{session.title}</p>
                  {session.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{session.description}</p>
                  )}
                  {sessionSubjects.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sessionSubjects.map((subjectId) => {
                        const subject = getSubjectById(subjectId)
                        return (
                          <span
                            key={subjectId}
                            className="text-micro px-1.5 py-0.5 rounded font-medium"
                            style={subject ? {
                              backgroundColor: subject.color + "14",
                              color: subject.color,
                            } : undefined}
                          >
                            {subject?.shortCode ?? subjectId}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(start, "MMM d, yyyy")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(start, "h:mm a")} — {format(end, "h:mm a")}
                    </span>
                    <span>
                      {hours > 0 ? `${hours}h ` : ""}{minutes}m
                    </span>
                  </div>
                  {session.topics && session.topics.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {session.topics.map((topic, i) => (
                        <span
                          key={i}
                          className="text-micro px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={session.status} />
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function StatusBadge({ status }: { status: StudySession["status"] }) {
  const config = {
    planned: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    "in-progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  }
  const labels = {
    planned: "Planned",
    "in-progress": "In Progress",
    completed: "Completed",
  }
  return (
    <span className={cn("text-micro px-1.5 py-0.5 rounded font-medium", config[status])}>
      {labels[status]}
    </span>
  )
}
