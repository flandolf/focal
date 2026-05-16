import { useEffect, useState } from "react"
import { FolderOpen, Plus, FolderUp, Loader2, Calendar, Settings } from "lucide-react"
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
import { formatDeadline, isOverdue } from "@/lib/utils"
import type { Project } from "@/lib/types"
import type { UnlistenFn } from "@tauri-apps/api/event"

interface ProjectDetailProps {
  project: Project
  onFilesChanged: () => void
  onOpenSettings: () => void
}

export function ProjectDetail({ project, onFilesChanged, onOpenSettings }: ProjectDetailProps) {
  const { files, loading, loadFiles, addFiles } = useProjectFiles(project.folder_path)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    loadFiles()
  }, [project.id, loadFiles])

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
                invoke("move_files_to_project", {
                  files: payload.paths,
                  projectName: project.folder_path,
                })
                  .then(() => {
                    loadFiles()
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
  }, [project.folder_path, loadFiles, onFilesChanged])

  const handleAddFiles = async () => {
    const count = await addFiles()
    if (count) {
      onFilesChanged()
    }
  }

  const handleOpenFolder = async () => {
    try {
      const home = await homeDir()
      const folderPath = `${home}/Documents/Projects/${project.folder_path}`
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

  return (
    <div className="flex flex-col h-full relative">
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/[0.04] border-2 border-dashed border-primary/25 m-3 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Plus className="h-6 w-6 text-primary/60" />
            </div>
            <p className="text-sm font-medium text-primary/70">Drop files here</p>
          </div>
        </div>
      )}

      <div className="px-8 pt-7 pb-5 border-b">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl leading-none">{project.icon || "📄"}</span>
              <h2 className="text-lg font-semibold tracking-tight">{project.name}</h2>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground ml-[42px]">{project.description}</p>
            )}
            <div className="flex items-center gap-3 ml-[42px]">
              <p className="text-xs text-muted-foreground font-mono tracking-tight">
                ~/Documents/Projects/<wbr />
                {project.folder_path}/
              </p>
              {project.deadline && (
                <Badge variant={isOverdue(project.deadline) ? "destructive" : "secondary"} className="gap-1 font-normal">
                  <Calendar className="h-3 w-3" />
                  {formatDeadline(project.deadline)}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
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
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="mb-5 w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <FolderOpen className="h-6 w-6 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No files yet</p>
            <p className="text-xs text-muted-foreground mb-5 max-w-64 leading-relaxed">
              Drag and drop files here, or select them from your computer to bring them into this project.
            </p>
            <Button variant="secondary" size="sm" onClick={handleAddFiles} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Files
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-8 py-2.5 text-xs text-muted-foreground font-medium border-b">
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
