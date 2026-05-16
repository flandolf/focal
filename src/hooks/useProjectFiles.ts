import { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { downloadDir } from "@tauri-apps/api/path"
import type { FileInfo } from "@/lib/types"

export function useProjectFiles(projectName: string | null) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [currentSubfolder, setCurrentSubfolder] = useState<string | null>(null)

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
      setFiles(result)
    } catch (e) {
      console.error("Failed to load files:", e)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [projectName])

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

  const removeFile = useCallback(async (_filePath: string) => {
    await loadFiles(currentSubfolder)
  }, [loadFiles, currentSubfolder])

  const deleteFiles = useCallback(async (filePaths: string[]) => {
    try {
      await invoke<number>("delete_files", { filePaths })
      await loadFiles(currentSubfolder)
    } catch (e) {
      console.error("Failed to delete files:", e)
      throw e
    }
  }, [loadFiles, currentSubfolder])

  return {
    files,
    loading,
    loadFiles,
    addFiles,
    removeFile,
    deleteFiles,
    currentSubfolder,
  }
}
