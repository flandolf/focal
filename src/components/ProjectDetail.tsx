import { useEffect, useState, useCallback } from "react"
import { Plus, Loader2 } from "lucide-react"
import { openPath } from "@tauri-apps/plugin-opener"
import { homeDir } from "@tauri-apps/api/path"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { toast } from "sonner"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { useProjectFiles } from "@/hooks/useProjectFiles"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import { DEFAULT_SUBFOLDERS, type FileTag } from "@/lib/types"
import type { CalendarEvent, Project, FileInfo, StudySession } from "@/lib/types"
import { ProjectHeader } from "@/components/project/ProjectHeader"
import { FileTree } from "@/components/project/FileTree"
import { SessionList } from "@/components/project/SessionList"
import { AutoRenameButton } from "@/components/AutoRenameButton"
import { notifyProjectActionError, joinHomePath } from "@/components/project/shared"

interface ProjectDetailProps {
  project: Project
  sessions: StudySession[]
  onFilesChanged: () => void
  onOpenSettings: () => void
  onToggleFinished?: (id: string) => void
  onSelectSession?: (session: StudySession) => void
  onNewSession?: () => void
  onCreateEvents?: (events: Omit<CalendarEvent, "id" | "created_at">[]) => Promise<void>
  onAddCustomSubfolder?: (projectId: string, folderName: string) => Promise<void>
  onRemoveCustomSubfolder?: (projectId: string, folderName: string) => Promise<void>
}

export function ProjectDetail({ project, sessions, onFilesChanged, onOpenSettings, onToggleFinished, onSelectSession, onNewSession, onCreateEvents, onAddCustomSubfolder, onRemoveCustomSubfolder }: ProjectDetailProps) {
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
  const [newFolderName, setNewFolderName] = useState("")
  const [isAddingFolder, setIsAddingFolder] = useState(false)

  const allSubfolders = [...DEFAULT_SUBFOLDERS, ...(project.customSubfolders ?? [])]

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
                    notifyProjectActionError("Could not move dropped files", e)
                  })
              }
              break
            case "leave":
              setIsDragging(false)
              break
          }
        })
      } catch (e) {
        notifyProjectActionError("Drag and drop is unavailable", e)
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
        ? joinHomePath(home, "Documents", "Projects", project.folder_path, selectedSubfolder)
        : joinHomePath(home, "Documents", "Projects", project.folder_path)
      await openPath(folderPath)
    } catch (e) {
      notifyProjectActionError("Could not open folder", e)
    }
  }

  const handleOpenFile = async (file: { path: string }) => {
    try {
      await openPath(file.path)
    } catch (e) {
      notifyProjectActionError("Could not open file", e)
    }
  }

  const handleRenameFile = async (file: FileInfo, newName: string) => {
    try {
      await renameFile(file.path, newName)
      onFilesChanged()
    } catch (e) {
      notifyProjectActionError("Could not rename file", e)
    }
  }

  const handleRemoveTag = async (file: FileInfo, tag: FileTag) => {
    try {
      await removeFileTag(file.path, tag)
      onFilesChanged()
    } catch (e) {
      notifyProjectActionError("Could not remove tag", e)
    }
  }

  const handleAddTag = async (file: FileInfo, tag: FileTag) => {
    try {
      await addFileTags([file.path], [tag])
      onFilesChanged()
    } catch (e) {
      notifyProjectActionError("Could not add tag", e)
    }
  }

  const handleToggleFavorite = async (file: FileInfo) => {
    try {
      await toggleFavorite(file.path)
      onFilesChanged()
    } catch (e) {
      notifyProjectActionError("Could not update favorite", e)
    }
  }

  const handleShowInFinder = async (file: FileInfo) => {
    try {
      const parentFolder = file.path.substring(0, file.path.lastIndexOf("/"))
      await openPath(parentFolder)
    } catch (e) {
      notifyProjectActionError("Could not show file in Finder", e)
    }
  }

  const handleCopyPath = async (file: FileInfo) => {
    try {
      await navigator.clipboard.writeText(file.path)
    } catch (e) {
      notifyProjectActionError("Could not copy path", e)
    }
  }

  const handleMoveFile = async (file: FileInfo, destSubfolder: string) => {
    try {
      const home = await homeDir()
      const destFolder = joinHomePath(home, "Documents", "Projects", project.folder_path, destSubfolder)
      await moveFileToFolder(file.path, destFolder)
      onFilesChanged()
    } catch (e) {
      notifyProjectActionError("Could not move file", e)
    }
  }

  const handleBulkTag = async (tag: FileTag) => {
    if (selectedFiles.size === 0) return
    try {
      await addFileTags(Array.from(selectedFiles), [tag])
      setSelectedFiles(new Set())
      onFilesChanged()
    } catch (e) {
      notifyProjectActionError("Could not tag selected files", e)
    }
  }

  const handleBulkMove = async (destSubfolder: string) => {
    if (selectedFiles.size === 0) return
    const home = await homeDir()
    const destFolder = joinHomePath(home, "Documents", "Projects", project.folder_path, destSubfolder)
    const paths = Array.from(selectedFiles)
    let moved = 0
    let failed = 0
    for (const fp of paths) {
      try {
        await moveFileToFolder(fp, destFolder)
        moved++
      } catch {
        failed++
      }
    }
    if (moved > 0) {
      setSelectedFiles(new Set())
      onFilesChanged()
    }
    if (failed > 0) {
      toast.error(`Could not move ${failed} file${failed === 1 ? "" : "s"}`)
    }
  }

  const handleApplyAutoRenames = useCallback(
    async (renames: { filePath: string; newName: string }[]) => {
      let failed = 0
      for (const { filePath, newName } of renames) {
        try {
          await renameFile(filePath, newName)
        } catch {
          failed++
        }
      }
      onFilesChanged()
      if (failed > 0) {
        toast.error(`Could not rename ${failed} file${failed === 1 ? "" : "s"}`)
      }
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
    const confirmed = await confirmDestructiveAction({
      title: `Delete ${selectedFiles.size} file${selectedFiles.size > 1 ? "s" : ""}?`,
      description: "Selected files will be removed from this assessment folder.",
      actionLabel: "Delete",
    })
    if (!confirmed) return
    const paths = Array.from(selectedFiles)
    try {
      await deleteFiles(paths)
      setSelectedFiles(new Set())
      onFilesChanged()
    } catch (e) {
      notifyProjectActionError("Could not delete selected files", e)
    }
  }

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

      <ProjectHeader
        project={project}
        sessions={sessions}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onOpenSettings={onOpenSettings}
        onToggleFinished={onToggleFinished}
        onOpenFolder={handleOpenFolder}
        onAddFiles={handleAddFiles}
        onCreateEvents={onCreateEvents}
        filteredFiles={filteredFiles}
        selectedFiles={selectedFiles}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {viewMode === "sessions" ? (
          <SessionList
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
        ) : (
          <FileTree
            project={project}
            files={files}
            loading={loading}
            filteredFiles={filteredFiles}
            selectedFiles={selectedFiles}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedTags={selectedTags}
            setSelectedTags={setSelectedTags}
            selectedSubfolder={selectedSubfolder}
            setSelectedSubfolder={setSelectedSubfolder}
            sortKey={sortKey}
            sortAsc={sortAsc}
            setSortKey={setSortKey}
            setSortAsc={setSortAsc}
            allSubfolders={allSubfolders}
            customSubfolders={project.customSubfolders ?? []}
            showBulkTagMenu={showBulkTagMenu}
            setShowBulkTagMenu={setShowBulkTagMenu}
            showBulkMoveMenu={showBulkMoveMenu}
            setShowBulkMoveMenu={setShowBulkMoveMenu}
            newFolderName={newFolderName}
            setNewFolderName={setNewFolderName}
            isAddingFolder={isAddingFolder}
            setIsAddingFolder={setIsAddingFolder}
            onAddCustomSubfolder={onAddCustomSubfolder}
            onRemoveCustomSubfolder={onRemoveCustomSubfolder}
            onAddFiles={handleAddFiles}
            onOpenFile={handleOpenFile}
            onRenameFile={handleRenameFile}
            onRemoveTag={handleRemoveTag}
            onAddTag={handleAddTag}
            onToggleFavorite={handleToggleFavorite}
            onShowInFinder={handleShowInFinder}
            onCopyPath={handleCopyPath}
            onMoveFile={handleMoveFile}
            onBulkTag={handleBulkTag}
            onBulkMove={handleBulkMove}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onDeleteSelected={handleDeleteSelected}
            onFileSelectionChange={handleFileSelectionChange}
          />
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
