import { createElement, useEffect, useState, useCallback } from "react"
import { FolderOpen, Plus, FolderUp, Loader2, Settings, Folder, Search, X, Trash2, Clock, Calendar, CheckCircle2, BookOpen, Languages, Library, Calculator, ChartNoAxesColumn, FlaskConical, Atom, Dna, Brain, Landmark, Map, TrendingUp, BriefcaseBusiness, ArrowUp, ArrowDown, Tag, MoveRight, type LucideIcon } from "lucide-react"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FileRow } from "@/components/FileRow"
import { AutoRenameButton } from "@/components/AutoRenameButton"
import { FileStudyPlannerButton } from "@/components/FileStudyPlannerButton"
import { useProjectFiles, type SortKey } from "@/hooks/useProjectFiles"
import { formatDeadline, isOverdue, getSubjectById, getDeadlineTypeInfo, getSessionSubjectIds } from "@/lib/utils"
import { DEFAULT_SUBFOLDERS, type FileTag } from "@/lib/types"
import type { CalendarEvent, Project, FileInfo, StudySession } from "@/lib/types"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { cn } from "@/lib/utils"

const PROJECT_ICONS: Record<string, LucideIcon> = {
  eng: BookOpen,
  "eng-lang": Languages,
  lit: Library,
  mm: Calculator,
  sm: Calculator,
  fm: ChartNoAxesColumn,
  chem: FlaskConical,
  phys: Atom,
  bio: Dna,
  psych: Brain,
  hist: Landmark,
  geo: Map,
  econ: TrendingUp,
  bm: BriefcaseBusiness,
}

const FILE_TABLE_GRID = "grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_2rem] min-[1000px]:grid-cols-[1rem_2rem_minmax(0,1fr)_5rem_3.5rem_2rem]"

function getProjectIcon(subjectId?: string): LucideIcon {
  if (subjectId && PROJECT_ICONS[subjectId]) return PROJECT_ICONS[subjectId]
  return Folder
}

interface ProjectDetailProps {
  project: Project
  sessions: StudySession[]
  onFilesChanged: () => void
  onOpenSettings: () => void
  onToggleFinished?: (id: string) => void
  onSelectSession?: (session: StudySession) => void
  onNewSession?: () => void
  onCreateEvents?: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
}

export function ProjectDetail({ project, sessions, onFilesChanged, onOpenSettings, onToggleFinished, onSelectSession, onNewSession, onCreateEvents }: ProjectDetailProps) {
  const {
    files, loading, loadFiles, addFiles, renameFile, moveFileToFolder, deleteFiles,
    addFileTags, removeFileTag, toggleFavorite,
    sortKey, sortAsc, setSortKey, setSortAsc,
  } = useProjectFiles(project.folder_path)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTags, setSelectedTags] = useState<FileTag[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"files" | "sessions">("files")
  const [showBulkTagMenu, setShowBulkTagMenu] = useState(false)
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false)

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

  const handleRemoveTag = async (file: FileInfo, tag: FileTag) => {
    try {
      await removeFileTag(file.path, tag)
      onFilesChanged()
    } catch (e) {
      console.error("Failed to remove tag:", e)
    }
  }

  const handleAddTag = async (file: FileInfo, tag: FileTag) => {
    try {
      await addFileTags([file.path], [tag])
      onFilesChanged()
    } catch (e) {
      console.error("Failed to add tag:", e)
    }
  }

  const handleToggleFavorite = async (file: FileInfo) => {
    try {
      await toggleFavorite(file.path)
      onFilesChanged()
    } catch (e) {
      console.error("Failed to toggle favorite:", e)
    }
  }

  const handleShowInFinder = async (file: FileInfo) => {
    try {
      const home = await homeDir()
      const parentFolder = file.path.substring(0, file.path.lastIndexOf("/"))
      const fullPath = `${home}Documents/Projects/${parentFolder}`
      await openPath(fullPath)
    } catch (e) {
      console.error("Failed to show in Finder:", e)
    }
  }

  const handleCopyPath = async (file: FileInfo) => {
    try {
      await navigator.clipboard.writeText(file.path)
    } catch (e) {
      console.error("Failed to copy path:", e)
    }
  }

  const handleMoveFile = async (file: FileInfo, destSubfolder: string) => {
    try {
      const home = await homeDir()
      const destFolder = `${home}Documents/Projects/${project.folder_path}/${destSubfolder}`
      await moveFileToFolder(file.path, destFolder)
      onFilesChanged()
    } catch (e) {
      console.error("Failed to move file:", e)
    }
  }

  const handleBulkTag = async (tag: FileTag) => {
    if (selectedFiles.size === 0) return
    try {
      await addFileTags(Array.from(selectedFiles), [tag])
      setSelectedFiles(new Set())
      onFilesChanged()
    } catch (e) {
      console.error("Failed to bulk tag:", e)
    }
  }

  const handleBulkMove = async (destSubfolder: string) => {
    if (selectedFiles.size === 0) return
    const home = await homeDir()
    const destFolder = `${home}Documents/Projects/${project.folder_path}/${destSubfolder}`
    const paths = Array.from(selectedFiles)
    let moved = 0
    for (const fp of paths) {
      try {
        await moveFileToFolder(fp, destFolder)
        moved++
      } catch (e) {
        console.error(`Failed to move ${fp}:`, e)
      }
    }
    if (moved > 0) {
      setSelectedFiles(new Set())
      onFilesChanged()
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
  const projectIcon = getProjectIcon(project.subjectId)
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

      {/* ── IDENTITY ZONE ── */}
      <div className="border-b border-border/70">
        <div className="px-5 pb-4 pt-5 min-[1200px]:px-8 min-[1200px]:pb-5 min-[1200px]:pt-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 min-[1200px]:gap-3.5">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/45 shadow-sm"
                  style={subject ? { backgroundColor: subject.color + "14", color: subject.color } : undefined}
                >
                  {createElement(projectIcon, { className: "h-5 w-5", "aria-hidden": true })}
                </span>
                <h2 className="truncate font-heading text-xl font-semibold min-[1200px]:text-2xl">{project.name}</h2>
              </div>
              <p className="mt-1.5 truncate text-caption text-muted-foreground">
                Files folder / <span className="font-mono">{project.folder_path}{selectedSubfolder ? `/${selectedSubfolder}` : ""}</span>
              </p>
              {project.description && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{project.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {project.unit && (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Unit {project.unit}
                  </span>
                )}
                {subject && (
                  <span
                    className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: subject.color + "14", color: subject.color }}
                  >
                    {subject.icon} {subject.name}
                  </span>
                )}
                {project.deadline && (
                  <Badge
                    variant={!project.isFinished && isOverdue(project.deadline) ? "destructive" : "secondary"}
                    className="gap-1 font-normal"
                    style={project.deadlineType ? { backgroundColor: deadlineInfo.color + "14", color: deadlineInfo.color, border: 'none' } : undefined}
                  >
                    {deadlineInfo.icon} {formatDeadline(project.deadline)}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onOpenSettings}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                  <TooltipContent side="bottom">Assessment details</TooltipContent>
              </Tooltip>
              {onToggleFinished && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                      onClick={() => onToggleFinished(project.id)}>
                      <CheckCircle2 className={cn("h-4 w-4", project.isFinished && "text-green-500")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {project.isFinished ? "Mark as current" : "Mark as complete"}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={handleOpenFolder} className="h-8 gap-1.5 rounded-lg bg-background/45">
                    <FolderUp className="h-4 w-4" />
                    <span className="max-[950px]:hidden">Open Folder</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Open in Finder</TooltipContent>
              </Tooltip>
              {onCreateEvents && (
                <FileStudyPlannerButton
                  project={project}
                  files={filteredFiles}
                  selectedFilePaths={selectedFiles}
                  onCreateEvents={onCreateEvents}
                />
              )}
              <Button size="sm" onClick={handleAddFiles} className="h-8 gap-1.5 rounded-lg">
                <Plus className="h-4 w-4" />
                <span>Add Files</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── TOOLBAR ZONE ── */}
        <div className="border-t border-border/30 px-5 py-2 min-[1200px]:px-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
              <button
                onClick={() => setViewMode("files")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
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
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors",
                  viewMode === "sessions"
                    ? "bg-background text-foreground font-medium shadow-sm"
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
              <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
                <button
                  onClick={() => setSelectedSubfolder(null)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    selectedSubfolder === null
                      ? "bg-background text-foreground font-medium shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                {DEFAULT_SUBFOLDERS.map((folder) => (
                  <button
                    key={folder}
                    onClick={() => setSelectedSubfolder(selectedSubfolder === folder ? null : folder)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors",
                      selectedSubfolder === folder
                        ? "bg-background text-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {folder}
                  </button>
                ))}
              </div>
            )}


            {viewMode === "files" && files.length > 0 && (
              <div className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5">
                <button
                  onClick={() => setSortAsc(!sortAsc)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  title={`Sort ${sortAsc ? "descending" : "ascending"}`}
                >
                  {sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                </button>
                {(["name", "modified", "size", "extension"] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (sortKey === key) setSortAsc(!sortAsc)
                      else setSortKey(key)
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs transition-colors",
                      sortKey === key
                        ? "bg-background text-foreground font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {{ name: "Name", modified: "Date", size: "Size", extension: "Type" }[key]}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1" />
            {viewMode === "sessions" && onNewSession && (
              <Button size="sm" onClick={onNewSession} className="h-7 gap-1.5 rounded-lg text-xs">
                <Plus className="h-3.5 w-3.5" />
                New Session
              </Button>
            )}
          </div>

          {viewMode === "files" && files.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 rounded-lg bg-background/45 pl-8 text-xs"
                />
              </div>
              {searchQuery && (
                <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")} className="h-7 w-7 rounded-lg p-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              <div className="mx-0.5 h-4 w-px bg-border/40" />
              {(["sac", "notes", "past-paper", "exam", "resource"] as FileTag[]).map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTags(
                    selectedTags.includes(tag)
                      ? selectedTags.filter(t => t !== tag)
                      : [...selectedTags, tag]
                  )}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-caption transition-colors",
                    selectedTags.includes(tag)
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
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
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background/35">
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
            <div className={cn(
              "grid items-center gap-3 border-b border-border/50 bg-muted/25 px-5 py-2.5 text-xs uppercase tracking-wider text-muted-foreground/70 min-[1200px]:px-8",
              FILE_TABLE_GRID,
            )}>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span>Name</span>
              <span className="text-right">Size</span>
              <span className="hidden text-right min-[1000px]:block">Type</span>
              <span className="sr-only">Actions</span>
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

                {/* Bulk tag */}
                <Popover
                  open={showBulkTagMenu}
                  onOpenChange={(open) => {
                    setShowBulkTagMenu(open)
                    if (open) setShowBulkMoveMenu(false)
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <Tag className="h-3 w-3" />
                      Tag
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-36 gap-1 p-1">
                    {(["sac", "notes", "past-paper", "exam", "resource", "other"] as FileTag[]).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => { void handleBulkTag(tag); setShowBulkTagMenu(false) }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs capitalize transition-colors hover:bg-accent"
                      >
                        {tag}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* Bulk move */}
                <Popover
                  open={showBulkMoveMenu}
                  onOpenChange={(open) => {
                    setShowBulkMoveMenu(open)
                    if (open) setShowBulkTagMenu(false)
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <MoveRight className="h-3 w-3" />
                      Move
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-40 gap-1 p-1">
                    {DEFAULT_SUBFOLDERS.map((folder) => (
                      <button
                        key={folder}
                        onClick={() => { void handleBulkMove(folder); setShowBulkMoveMenu(false) }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                      >
                        {folder}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

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
              <div className="divide-y divide-border/60">
                {filteredFiles.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    onOpen={handleOpenFile}
                    onRename={handleRenameFile}
                    onRemoveTag={handleRemoveTag}
                    onAddTag={handleAddTag}
                    onToggleFavorite={handleToggleFavorite}
                    onShowInFinder={handleShowInFinder}
                    onCopyPath={handleCopyPath}
                    onMoveFile={handleMoveFile}
                    isSelected={selectedFiles.has(file.path)}
                    onSelectionChange={handleFileSelectionChange}
                    subfolders={DEFAULT_SUBFOLDERS}
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
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background/35">
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
      <div className="space-y-1.5 px-5 py-3 min-[1200px]:px-8">
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
              className="w-full text-left rounded-lg border border-border/60 bg-background/20 p-3 transition-colors hover:border-border hover:bg-accent/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{session.title}</p>
                    <StatusBadge status={session.status} />
                  </div>
                  {session.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{session.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(start, "MMM d, yyyy")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(start, "h:mm a")} — {format(end, "h:mm a")}
                    </span>
                    <span className="tabular-nums">{hours > 0 ? `${hours}h ` : ""}{minutes}m</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {sessionSubjects.map((subjectId) => {
                      const subject = getSubjectById(subjectId)
                      return (
                        <span
                          key={subjectId}
                          className="text-micro px-1.5 py-0.5 rounded font-medium"
                          style={subject ? { backgroundColor: subject.color + "14", color: subject.color } : undefined}
                        >
                          {subject?.shortCode ?? subjectId}
                        </span>
                      )
                    })}
                    {session.topics && session.topics.length > 0 && session.topics.map((topic, i) => (
                      <span key={i} className="text-micro px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {topic}
                      </span>
                    ))}
                  </div>
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
