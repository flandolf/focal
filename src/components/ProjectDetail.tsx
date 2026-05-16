import { useEffect, useState } from "react"
import { FolderOpen, Plus, FolderUp, Loader2, Settings, Folder, Search, X, Trash2, Calculator, Clock, Calendar } from "lucide-react"
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
import { useProjectFiles } from "@/hooks/useProjectFiles"
import { formatDeadline, isOverdue, getSubjectById, getDeadlineTypeInfo } from "@/lib/utils"
import { DEFAULT_SUBFOLDERS, type FileTag } from "@/lib/types"
import type { Project, FileInfo, StudySession } from "@/lib/types"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { cn } from "@/lib/utils"

interface ProjectDetailProps {
  project: Project
  sessions: StudySession[]
  onFilesChanged: () => void
  onOpenSettings: () => void
  onOpenGrades?: () => void
  onSelectSession?: (session: StudySession) => void
  onNewSession?: () => void
}

export function ProjectDetail({ project, sessions, onFilesChanged, onOpenSettings, onOpenGrades, onSelectSession, onNewSession }: ProjectDetailProps) {
  const { files, loading, loadFiles, addFiles, deleteFiles } = useProjectFiles(project.folder_path)
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

  const filteredFiles = files.filter((file) => {
    // Filter by search query
    if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    // Filter by tags - support both new tags array and legacy tag field
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
    <div className="flex flex-col h-full relative">
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[1px] m-4 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Plus className="h-7 w-7 text-primary/60" />
            </div>
            <p className="text-sm font-medium text-primary/70">Drop files here</p>
          </div>
        </div>
      )}

      <div className="px-8 pt-8 pb-5 border-b">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-2xl leading-none">{project.icon ?? "📄"}</span>
              <h2 className="text-xl font-semibold tracking-tight">{project.name}</h2>
              {project.unit && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
                  Unit {project.unit}
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-2 max-w-lg leading-relaxed">{project.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              {subject && (
                <span
                  className="text-xs px-2 py-0.5 rounded-md font-medium flex items-center gap-1.5"
                  style={{
                    backgroundColor: subject.color + "18",
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
                    backgroundColor: deadlineInfo.color + "18",
                    color: deadlineInfo.color,
                    border: 'none',
                  } : undefined}
                >
                  {deadlineInfo.icon} {formatDeadline(project.deadline)}
                </Badge>
              )}
              <p className="text-xs text-muted-foreground/60 font-mono tracking-tight truncate">
                ~/Documents/Projects/<wbr />
                {project.folder_path}{selectedSubfolder ? `/${selectedSubfolder}` : ""}/
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenSettings}>
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Settings</TooltipContent>
            </Tooltip>
            {onOpenGrades && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenGrades}>
                    <Calculator className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Grades</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleOpenFolder} className="gap-1.5 h-8">
                  <FolderUp className="h-4 w-4" />
                  <span>Open Folder</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open in Finder</TooltipContent>
            </Tooltip>
            <Button size="sm" onClick={handleAddFiles} className="gap-1.5 h-8">
              <Plus className="h-4 w-4" />
              <span>Add Files</span>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-5">
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("files")}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors",
                viewMode === "files"
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Folder className="h-3.5 w-3.5" />
              Files
            </button>
            <button
              onClick={() => setViewMode("sessions")}
              className={cn(
                "px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors",
                viewMode === "sessions"
                  ? "bg-background text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              Sessions
              {sessions.length > 0 && (
                <span className="tabular-nums text-[10px]">{sessions.length}</span>
              )}
            </button>
          </div>
          <div className="flex-1" />
          {viewMode === "sessions" && onNewSession && (
            <Button size="sm" onClick={onNewSession} className="gap-1.5 h-7 text-xs">
              <Plus className="h-3.5 w-3.5" />
              New Session
            </Button>
          )}
        </div>

        {viewMode === "files" && (
        <div className="flex items-center gap-1 mt-2 -ml-1">
          <button
            onClick={() => setSelectedSubfolder(null)}
            className={cn(
              "px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors",
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
                "px-3 py-1.5 text-xs rounded-md flex items-center gap-1.5 transition-colors",
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
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {viewMode === "sessions" ? (
          <SessionsView
            sessions={sessions}
            projectName={project.name}
            onSelectSession={onSelectSession}
            onNewSession={onNewSession}
          />
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="mb-6 w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
              <FolderOpen className="h-7 w-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1.5">No files yet</p>
            <p className="text-xs text-muted-foreground mb-6 max-w-56 leading-relaxed">
              Drag and drop files here, or select them from your computer to bring them into this project.
            </p>
            <Button variant="secondary" size="sm" onClick={handleAddFiles} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Files
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-8 py-4 border-b">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/50" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery("")}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 px-8 py-3 border-b flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Filter:</span>
              {(["sac", "notes", "past-paper", "exam", "resource"] as FileTag[]).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTags(
                    selectedTags.includes(tag)
                      ? selectedTags.filter(t => t !== tag)
                      : [...selectedTags, tag]
                  )}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-md transition-colors",
                    selectedTags.includes(tag)
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {tag}
                </button>
              ))}
              {selectedTags.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTags([])}
                  className="h-6 px-2 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3 px-8 py-2 text-[11px] text-muted-foreground/70 font-medium uppercase tracking-wider border-b">
              <span className="w-4 shrink-0" />
              <span className="flex-1">Name</span>
              <span className="w-20 text-right">Size</span>
              <span className="w-16 text-right">Type</span>
            </div>
            {selectedFiles.size > 0 && (
              <div className="flex items-center gap-3 px-8 py-3 bg-accent/20 border-b">
                <span className="text-xs font-medium">{selectedFiles.size} selected</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-7 px-2 text-xs"
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="h-7 px-2 text-xs"
                >
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
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {filteredFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    onOpen={handleOpenFile}
                    isSelected={selectedFiles.has(file.path)}
                    onSelectionChange={handleFileSelectionChange}
                  />
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}

function SessionsView({
  sessions,
  projectName,
  onSelectSession,
  onNewSession,
}: {
  sessions: StudySession[]
  projectName: string
  onSelectSession?: (session: StudySession) => void
  onNewSession?: () => void
}) {
  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="mb-6 w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
          <Clock className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1.5">No study sessions</p>
        <p className="text-xs text-muted-foreground mb-6 max-w-56 leading-relaxed">
          Plan study sessions for {projectName} to track your revision time and progress.
        </p>
        {onNewSession && (
          <Button variant="secondary" size="sm" onClick={onNewSession} className="gap-1.5">
            <Plus className="h-4 w-4" />
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
      <div className="px-8 py-4 space-y-2">
        {sorted.map((session) => {
          const start = parseISO(session.startTime)
          const end = parseISO(session.endTime)
          const durationMs = end.getTime() - start.getTime()
          const hours = Math.floor(durationMs / (1000 * 60 * 60))
          const minutes = Math.round((durationMs % (1000 * 60 * 60)) / (1000 * 60))

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
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
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
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", config[status])}>
      {labels[status]}
    </span>
  )
}
