import { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { downloadDir } from "@tauri-apps/api/path"
import type { FileInfo } from "@/lib/types"

export function useProjectFiles(projectName: string | null) {
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)

  const loadFiles = useCallback(async () => {
    if (!projectName) {
      setFiles([])
      return
    }
    setLoading(true)
    try {
      const result = await invoke<FileInfo[]>("get_project_files", {
        projectName,
      })
      setFiles(result)
    } catch (e) {
      console.error("Failed to load files:", e)
    } finally {
      setLoading(false)
    }
  }, [projectName])

  const addFiles = useCallback(async () => {
    if (!projectName) return

    const selected = await open({
      multiple: true,
      directory: false,
      defaultPath: await downloadDir(),
    })

    if (!selected || selected.length === 0) return

    try {
      await invoke("move_files_to_project", {
        files: selected as string[],
        projectName,
      })
      await loadFiles()
      return selected.length
    } catch (e) {
      console.error("Failed to move files:", e)
      throw e
    }
  }, [projectName, loadFiles])

  const removeFile = useCallback(async (_filePath: string) => {
    // For MVP, just refresh the list (file is already physically gone or we untrack)
    await loadFiles()
  }, [loadFiles])

  return {
    files,
    loading,
    loadFiles,
    addFiles,
    removeFile,
  }
}
