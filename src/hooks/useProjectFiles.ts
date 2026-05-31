import { useState, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { downloadDir } from "@tauri-apps/api/path"
import type { FileInfo, FileTag } from "@/lib/types"
import {
  setFileTags,
  addFileTags,
  removeFileTag,
  toggleFileFavorite,
  mergeMetadata,
  purgeMetadata,
} from "@/lib/fileMetadata"

export type SortKey = "name" | "modified" | "size" | "extension"

const SORT_COMPARATORS: Record<SortKey, (a: FileInfo, b: FileInfo) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  modified: (a, b) => b.modified - a.modified,
  size: (a, b) => a.size - b.size,
  extension: (a, b) => a.extension.localeCompare(b.extension) || a.name.localeCompare(b.name, undefined, { numeric: true }),
}

function updateFileTags(file: FileInfo, tags: FileTag[]): FileInfo {
  return {
    ...file,
    tag: undefined,
    tags: tags.length > 0 ? tags : undefined,
  }
}

export function useProjectFiles(projectName: string | null) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [currentSubfolder, setCurrentSubfolder] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortAsc, setSortAsc] = useState(true)

  const loadFiles = useCallback(async (subfolder: string | null = null) => {
    if (!projectName) {
      setFiles([])
      return
    }
    setLoading(true)
    setCurrentSubfolder(subfolder)
    try {
      const folderPath = subfolder
        ? `${projectName}/${subfolder}`
        : projectName
      const result = await invoke<FileInfo[]>("get_project_files", {
        projectName: folderPath,
      })
      await mergeMetadata(result)
      setFiles(result)
    } catch (e) {
      console.error("Failed to load files:", e)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [projectName])

  const sortedFiles = useMemo(() => {
    const cmp = SORT_COMPARATORS[sortKey]
    const sorted = [...files].sort(cmp)
    return sortAsc ? sorted : sorted.reverse()
  }, [files, sortKey, sortAsc])

  const addFiles = useCallback(async (subfolder: string | null = null) => {
    if (!projectName) return

    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: await downloadDir(),
    })

    if (!selected || selected.length === 0) return

    try {
      const targetFolder = subfolder
        ? `${projectName}/${subfolder}`
        : projectName
      await invoke("move_files_to_project", {
        files: selected,
        projectName: targetFolder,
      })
      await loadFiles(subfolder)
      return selected.length
    } catch (e) {
      console.error("Failed to move files:", e)
      throw e
    }
  }, [projectName, loadFiles])

  const renameFile = useCallback(async (filePath: string, newName: string) => {
    try {
      await invoke<string>("rename_file", { filePath, newName })
      await loadFiles(currentSubfolder)
    } catch (e) {
      console.error("Failed to rename file:", e)
      throw e
    }
  }, [loadFiles, currentSubfolder])

  const moveFileToFolder = useCallback(async (filePath: string, destFolder: string) => {
    try {
      await invoke<string>("move_file_to_folder", { filePath, destFolder })
      await loadFiles(currentSubfolder)
    } catch (e) {
      console.error("Failed to move file:", e)
      throw e
    }
  }, [loadFiles, currentSubfolder])

  const deleteFiles = useCallback(async (filePaths: string[]) => {
    try {
      await invoke<number>("delete_files", { filePaths })
      await purgeMetadata(filePaths)
      await loadFiles(currentSubfolder)
    } catch (e) {
      console.error("Failed to delete files:", e)
      throw e
    }
  }, [loadFiles, currentSubfolder])

  const handleSetFileTags = useCallback(async (filePaths: string[], tags: FileTag[]) => {
    const filePathSet = new Set(filePaths)
    setFiles((current) =>
      current.map((file) => filePathSet.has(file.path) ? updateFileTags(file, tags) : file),
    )
    await setFileTags(filePaths, tags)
  }, [])

  const handleAddFileTags = useCallback(async (filePaths: string[], tags: FileTag[]) => {
    const filePathSet = new Set(filePaths)
    setFiles((current) =>
      current.map((file) => {
        if (!filePathSet.has(file.path)) return file
        const nextTags = new Set(file.tags ?? (file.tag ? [file.tag] : []))
        for (const tag of tags) nextTags.add(tag)
        return updateFileTags(file, [...nextTags])
      }),
    )
    await addFileTags(filePaths, tags)
  }, [])

  const handleRemoveFileTag = useCallback(async (filePath: string, tag: FileTag) => {
    setFiles((current) =>
      current.map((file) => {
        if (file.path !== filePath) return file
        const nextTags = (file.tags ?? (file.tag ? [file.tag] : [])).filter((fileTag) => fileTag !== tag)
        return updateFileTags(file, nextTags)
      }),
    )
    await removeFileTag(filePath, tag)
  }, [])

  const handleToggleFavorite = useCallback(async (filePath: string): Promise<boolean> => {
    const optimistic = !files.find((file) => file.path === filePath)?.isFavorite
    setFiles((current) =>
      current.map((file) =>
        file.path === filePath
          ? { ...file, isFavorite: optimistic }
          : file,
      ),
    )
    const result = await toggleFileFavorite(filePath)
    setFiles((current) =>
      current.map((file) =>
        file.path === filePath
          ? { ...file, isFavorite: result }
          : file,
      ),
    )
    return result
  }, [files])

  return {
    files: sortedFiles,
    loading,
    loadFiles,
    addFiles,
    renameFile,
    moveFileToFolder,
    deleteFiles,
    setFileTags: handleSetFileTags,
    addFileTags: handleAddFileTags,
    removeFileTag: handleRemoveFileTag,
    toggleFavorite: handleToggleFavorite,
    currentSubfolder,
    sortKey,
    sortAsc,
    setSortKey,
    setSortAsc,
  }
}
