import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { downloadDir, join } from "@tauri-apps/api/path"
import { watch } from "@tauri-apps/plugin-fs"

import type { FileInfo, FileTag } from "@/lib/types"
import { useLatestRef } from "@/lib/hooks/useLatestRef"
import {
  setFileTags,
  addFileTags,
  removeFileTag,
  toggleFileFavorite,
  mergeMetadata,
  purgeMetadata,
} from "@/lib/fileMetadata"

export type SortKey = "name" | "modified" | "size" | "extension" | "tags"

function tagsCompare(a: FileInfo, b: FileInfo): number {
  const aTags = a.tags ?? (a.tag ? [a.tag] : [])
  const bTags = b.tags ?? (b.tag ? [b.tag] : [])
  const aStr = aTags.join(", ")
  const bStr = bTags.join(", ")
  return aStr.localeCompare(bStr) || a.name.localeCompare(b.name, undefined, { numeric: true })
}

export const SORT_COMPARATORS: Record<SortKey, (a: FileInfo, b: FileInfo) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
  modified: (a, b) => b.modified - a.modified,
  size: (a, b) => a.size - b.size,
  extension: (a, b) => a.extension.localeCompare(b.extension) || a.name.localeCompare(b.name, undefined, { numeric: true }),
  tags: tagsCompare,
}

/** Lightweight hash to detect whether the file list has changed without merging metadata. */
function computeFilesHash(files: FileInfo[]): string {
  let totalSize = 0
  let maxModified = 0
  const paths: string[] = []
  for (const f of files) {
    totalSize += f.size
    maxModified = Math.max(maxModified, f.modified)
    paths.push(f.path)
  }
  return `${files.length}:${totalSize}:${maxModified}:${paths.sort().join("|")}`
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
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const [changedPaths, setChangedPaths] = useState<Set<string>>(new Set())
  const [removedFiles, setRemovedFiles] = useState<FileInfo[]>([])
  const filesHashRef = useRef<string>("")
  const filesRef = useRef<FileInfo[]>([])
  const changedPathsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removedFilesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    filesRef.current = files
  }, [files])

  const loadFiles = useCallback(async (options?: { silent?: boolean; notifyOnChange?: boolean }) => {
    if (!options?.notifyOnChange) {
      setHasPendingChanges(false)
    }
    if (!projectName) {
      filesHashRef.current = ""
      setFiles([])
      setRemovedFiles([])
      return
    }
    if (!options?.silent) setLoading(true)
    try {
      const result = await invoke<FileInfo[]>("get_project_files", {
        projectName,
        recursive: true,
      })
      // Normalize subfolder separator (Rust uses \ on Windows)
      for (const f of result) {
        if (f.subfolder) {
          f.subfolder = f.subfolder.replace(/\\/g, "/")
        }
      }
      const hash = computeFilesHash(result)
      if (hash !== filesHashRef.current) {
        filesHashRef.current = hash
        await mergeMetadata(result)
        setFiles(result)
        if (options?.notifyOnChange) {
          setHasPendingChanges(true)
          const oldPaths = new Set(filesRef.current.map((f) => f.path))
          const newPaths = new Set(result.map((f) => f.path))
          const diff = new Set<string>()
          for (const p of newPaths) if (!oldPaths.has(p)) diff.add(p)
          for (const p of oldPaths) if (!newPaths.has(p)) diff.add(p)
          if (diff.size > 0) {
            setChangedPaths(diff)
            if (changedPathsTimeoutRef.current) clearTimeout(changedPathsTimeoutRef.current)
            changedPathsTimeoutRef.current = setTimeout(() => setChangedPaths(new Set()), 600)
          }
          const removed = filesRef.current.filter((f) => !newPaths.has(f.path))
          if (removed.length > 0) {
            setRemovedFiles((prev) => {
              const existing = new Set(prev.map((f) => f.path))
              const merged = [...prev]
              for (const f of removed) {
                if (!existing.has(f.path)) merged.push(f)
              }
              return merged
            })
            if (removedFilesTimeoutRef.current) clearTimeout(removedFilesTimeoutRef.current)
            removedFilesTimeoutRef.current = setTimeout(() => setRemovedFiles([]), 400)
          }
        }
      }
    } catch (e) {
      console.error("Failed to load files:", e)
      filesHashRef.current = ""
      setFiles([])
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [projectName])

  const sortedFiles = useMemo(() => {
    const cmp = SORT_COMPARATORS[sortKey]
    const sorted = [...files].sort(cmp)
    return sortAsc ? sorted : sorted.reverse()
  }, [files, sortKey, sortAsc])

  /** Derive all unique subfolder paths from the loaded files. */
  const allSubfolders = useMemo(() => {
    const set = new Set<string>()
    for (const f of files) {
      if (f.subfolder) {
        set.add(f.subfolder)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [files])

  /** First-level subfolder names extracted from the file list. */
  const firstLevelSubfolders = useMemo(() => {
    const set = new Set<string>()
    for (const f of files) {
      if (f.subfolder) {
        const first = f.subfolder.split("/")[0]
        if (first) set.add(first)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [files])

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
      await loadFiles()
      return selected.length
    } catch (e) {
      await loadFiles()
      console.error("Failed to move files:", e)
      throw e
    }
  }, [projectName, loadFiles])

  const renameFile = useCallback(async (filePath: string, newName: string) => {
    try {
      await invoke<string>("rename_file", { filePath, newName })
      await loadFiles()
    } catch (e) {
      console.error("Failed to rename file:", e)
      throw e
    }
  }, [loadFiles])

  const moveFileToFolder = useCallback(async (filePath: string, destFolder: string) => {
    try {
      await invoke<string>("move_file_to_folder", { filePath, destFolder })
      await loadFiles()
    } catch (e) {
      console.error("Failed to move file:", e)
      throw e
    }
  }, [loadFiles])

  const deleteFiles = useCallback(async (filePaths: string[]) => {
    try {
      await invoke<number>("delete_files", { filePaths })
      await purgeMetadata(filePaths)
      await loadFiles()
    } catch (e) {
      console.error("Failed to delete files:", e)
      throw e
    }
  }, [loadFiles])

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

  /** Watch the project directory for external file system changes. */
  const loadFilesRef = useLatestRef(loadFiles)
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectName) return

    let unwatch: (() => void) | undefined

    const setup = async () => {
      try {
        const projectsDir = await invoke<string>("get_projects_directory")
        const projectPath = await join(projectsDir, projectName)
        unwatch = await watch(
          projectPath,
          () => {
            if (refreshTimeoutRef.current) {
              clearTimeout(refreshTimeoutRef.current)
            }
            refreshTimeoutRef.current = setTimeout(() => {
              refreshTimeoutRef.current = null
              void loadFilesRef.current({ silent: true, notifyOnChange: true })
            }, 200)
          },
          { recursive: true },
        )
      } catch (e) {
        console.error("Failed to watch project directory:", e)
      }
    }

    void setup()

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
      void unwatch?.()
    }
  }, [projectName, loadFilesRef])

  /** Refresh immediately when the window regains focus. */
  useEffect(() => {
    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        void loadFiles({ silent: true, notifyOnChange: true })
      }
    }
    document.addEventListener("visibilitychange", handleFocus)
    return () => document.removeEventListener("visibilitychange", handleFocus)
  }, [loadFiles])

  return {
    files: sortedFiles,
    allSubfolders,
    firstLevelSubfolders,
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
    sortKey,
    sortAsc,
    setSortKey,
    setSortAsc,
    hasPendingChanges,
    changedPaths,
    removedFiles,
  }
}
