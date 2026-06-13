import { useEffect, useState, useCallback, useMemo, memo } from "react"
import { Plus, Loader2 } from "lucide-react"
import { openPath } from "@tauri-apps/plugin-opener"
import { homeDir } from "@tauri-apps/api/path"
import { invoke } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { toast } from "sonner"
import type { UnlistenFn } from "@tauri-apps/api/event"
import { useProjectFiles } from "@/hooks/useProjectFiles"
import { confirmDestructiveAction } from "@/lib/confirmToast"
import { type FileTag } from "@/lib/types"
import type { CalendarEvent, Project, FileInfo, StudySession } from "@/lib/types"
import { ProjectHeader } from "@/components/project/ProjectHeader"
import { FileTree } from "@/components/project/FileTree"
import type { ListItem } from "@/components/project/FileTree"
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

}

export const ProjectDetail = memo(function ProjectDetail({ project, sessions, onFilesChanged, onOpenSettings, onToggleFinished, onSelectSession, onNewSession, onCreateEvents }: ProjectDetailProps) {
  const {
    files, loading, loadFiles, addFiles, renameFile, moveFileToFolder, deleteFiles,
    addFileTags, removeFileTag, toggleFavorite,
    sortKey, sortAsc, setSortKey, setSortAsc,
    firstLevelSubfolders, allSubfolders,
  } = useProjectFiles(project.folder_path)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>("__root__")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTags, setSelectedTags] = useState<FileTag[]>([])
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"files" | "sessions">("files")
  const [showBulkTagMenu, setShowBulkTagMenu] = useState(false)
  const [showBulkMoveMenu, setShowBulkMoveMenu] = useState(false)

  /** Breadcrumb segments derived from current subfolder path */
  const breadcrumbSegments = useMemo(() => {
    const segments: { label: string; path: string }[] = []
    if (selectedSubfolder === null) {
      segments.push({ label: "All Files", path: "__all__" })
    } else {
      segments.push({ label: "Project Files", path: "__root__" })
      if (selectedSubfolder !== "__root__") {
        const parts = selectedSubfolder.split("/")
        let currentPath = ""
        for (const part of parts) {
          currentPath = currentPath ? `${currentPath}/${part}` : part
          segments.push({ label: part, path: currentPath })
        }
      }
    }
    return segments
  }, [selectedSubfolder])

  const canGoBack = useMemo(() => {
    if (selectedSubfolder === null) return false
    return selectedSubfolder !== "__root__"
  }, [selectedSubfolder])

  const handleGoBack = useCallback(() => {
    if (selectedSubfolder === null || selectedSubfolder === "__root__") return
    const parts = selectedSubfolder.split("/")
    if (parts.length === 1) {
      setSelectedSubfolder("__root__")
    } else {
      setSelectedSubfolder(parts.slice(0, -1).join("/"))
    }
  }, [selectedSubfolder])

  const handleBreadcrumbNavigate = useCallback((path: string) => {
    if (path === "__all__") {
      setSelectedSubfolder(null)
    } else {
      setSelectedSubfolder(path)
    }
  }, [])

  useEffect(() => {
    void loadFiles()
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
                const targetFolder = selectedSubfolder && selectedSubfolder !== "__root__"
                  ? `${project.folder_path}/${selectedSubfolder}`
                  : project.folder_path
                invoke("move_files_to_project", {
                  files: payload.paths,
                  projectName: targetFolder,
                })
                  .then(() => {
                    void loadFiles()
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
    const count = await addFiles(selectedSubfolder === "__root__" ? null : selectedSubfolder)
    if (count) {
      onFilesChanged()
    }
  }

  const handleOpenFolder = async () => {
    try {
      const home = await homeDir()
      const folderPath = selectedSubfolder && selectedSubfolder !== "__root__"
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

  const handleFolderTagAll = useCallback(async (folderPath: string, tag: FileTag) => {
    const pathsToTag = files
      .filter((file) => {
        if (!file.subfolder) return false
        return file.subfolder === folderPath || file.subfolder.startsWith(`${folderPath}/`)
      })
      .map((file) => file.path)

    if (pathsToTag.length === 0) {
      toast.error(`No files found in "${folderPath}"`)
      return
    }

    try {
      await addFileTags(pathsToTag, [tag])
      onFilesChanged()
      toast.success(`Tagged ${pathsToTag.length} file${pathsToTag.length > 1 ? "s" : ""} as "${tag}"`)
    } catch (e) {
      notifyProjectActionError("Could not tag files in folder", e)
    }
  }, [files, addFileTags, onFilesChanged])

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

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      if (selectedTags.length > 0) {
        const fileTags = file.tags ?? (file.tag ? [file.tag] : [])
        return selectedTags.some(tag => fileTags.includes(tag))
      }
      if (selectedSubfolder === "__root__") {
        return !file.subfolder
      }
      if (selectedSubfolder) {
        // Only show files directly in this folder (not descendants)
        const fileSubfolder = file.subfolder ?? ""
        if (fileSubfolder !== selectedSubfolder) {
          return false
        }
      }
      return true
    })
  }, [files, searchQuery, selectedTags, selectedSubfolder])

  const listItems = useMemo(() => {
    const items: ListItem[] = []

    const showFolders = !searchQuery && selectedTags.length === 0 && selectedSubfolder !== null

    if (showFolders) {
      // Recursive file count: each file contributes to every ancestor folder path
      const fileCountsByFolder = new Map<string, number>()
      for (const f of files) {
        if (!f.subfolder) continue
        const parts = f.subfolder.split("/")
        let current = ""
        for (const part of parts) {
          current = current ? `${current}/${part}` : part
          fileCountsByFolder.set(current, (fileCountsByFolder.get(current) ?? 0) + 1)
        }
      }

      if (selectedSubfolder === "__root__") {
        for (const folder of firstLevelSubfolders) {
          items.push({ type: "folder", name: folder, path: folder, fileCount: fileCountsByFolder.get(folder) ?? 0 })
        }
      } else if (selectedSubfolder) {
        const childFolders = new Set<string>()
        for (const f of files) {
          if (f.subfolder?.startsWith(`${selectedSubfolder}/`)) {
            const relative = f.subfolder.slice(selectedSubfolder.length + 1)
            const firstPart = relative.split("/")[0]
            if (firstPart) childFolders.add(firstPart)
          }
        }
        for (const folder of childFolders) {
          const fullPath = `${selectedSubfolder}/${folder}`
          items.push({ type: "folder", name: folder, path: fullPath, fileCount: fileCountsByFolder.get(fullPath) ?? 0 })
        }
      }
    }

    for (const file of filteredFiles) {
      items.push({ type: "file", data: file })
    }

    items.sort((a, b) => {
      const nameA = a.type === "file" ? a.data.name : a.name
      const nameB = b.type === "file" ? b.data.name : b.name
      return nameA.localeCompare(nameB, undefined, { numeric: true })
    })

    return items
  }, [filteredFiles, firstLevelSubfolders, selectedSubfolder, files, searchQuery, selectedTags])

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
    const allPaths = new Set(filteredFiles.map((f) => f.path))
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
        <div className="absolute inset-4 z-modal-backdrop flex items-center justify-center rounded-[1.25rem] border border-primary/25 bg-background/70 backdrop-blur-xl pointer-events-none active-glow">
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-primary/12 flex items-center justify-center shadow-[0_0_40px_-12px_color-mix(in_oklch,var(--primary)_30%,transparent)]">
              <Plus className="h-7 w-7 text-primary/70" />
            </div>
            <p className="text-sm font-medium text-primary/80">Drop files here</p>
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
            files={files}
            loading={loading}
            listItems={listItems}
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
            showBulkTagMenu={showBulkTagMenu}
            setShowBulkTagMenu={setShowBulkTagMenu}
            showBulkMoveMenu={showBulkMoveMenu}
            setShowBulkMoveMenu={setShowBulkMoveMenu}
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
            onFolderTagAll={handleFolderTagAll}
            breadcrumbSegments={breadcrumbSegments}
            onBreadcrumbNavigate={handleBreadcrumbNavigate}
            onGoBack={handleGoBack}
            canGoBack={canGoBack}
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
})
