import { useEffect, useState } from "react"
import { FolderOpen, Plus, FolderUp, Loader2, Calendar, Settings, Folder } from "lucide-react"
import { openPath } from "@tauri-apps/plugin-opener"
import { homeDir } from "@tauri-apps/api/path"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FileRow } from "@/components/FileRow"
import { useProjectFiles } from "@/hooks/useProjectFiles"
import { formatDeadline, isOverdue, getSubjectById, getDeadlineTypeInfo } from "@/lib/utils"
import { DEFAULT_SUBFOLDERS } from "@/lib/types"
import type { Project } from "@/lib/types"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { cn } from "@/lib/utils"

interface ProjectDetailProps {
  project: Project
  onFilesChanged: () => void
  onOpenSettings: () => void
}

export function ProjectDetail({ project, onFilesChanged, onOpenSettings }: ProjectDetailProps) {
  const { files, loading, loadFiles, addFiles, currentSubfolder } = useProjectFiles(project.folder_path)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null)

  useEffect(() => {
    loadFiles(selectedSubfolder)
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
                    loadFiles(selectedSubfolder)
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

    setup()

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
              <span className="text-2xl leading-none">{project.icon || "📄"}</span>
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
        <div className="flex items-center gap-1 mt-5 -ml-1">
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
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {loading ? (
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
            <div className="flex items-center gap-3 px-8 py-2 text-[11px] text-muted-foreground/70 font-medium uppercase tracking-wider border-b">
              <span className="w-4 shrink-0" />
              <span className="flex-1">Name</span>
              <span className="w-20 text-right">Size</span>
              <span className="w-16 text-right">Type</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y">
                {files.map((file) => (
                  <FileRow key={file.path} file={file} onOpen={handleOpenFile} />
                ))}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}
