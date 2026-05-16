import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"
import type { Project } from "@/lib/types"
import { sanitiseFolderName } from "@/lib/utils"

function getProjectsFilePath(baseDir: string) {
  return `${baseDir}/projects.json`
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      setError(null)
      const baseDir = await appDataDir()
      const filePath = getProjectsFilePath(baseDir)

      if (await exists(filePath)) {
        const content = await readTextFile(filePath)
        setProjects(JSON.parse(content))
      }
    } catch (e) {
      const msg = `Failed to load projects: ${e}`
      console.error(msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveProjects = useCallback(async (updatedProjects: Project[]) => {
    const baseDir = await appDataDir()
    const dirExists = await exists(baseDir)
    if (!dirExists) {
      await mkdir(baseDir, { recursive: true })
    }
    const filePath = getProjectsFilePath(baseDir)
    await writeTextFile(filePath, JSON.stringify(updatedProjects, null, 2))
    setProjects(updatedProjects)
  }, [])

  const addProject = useCallback(async (name: string, description?: string, icon?: string, deadline?: string) => {
    const sanitised = sanitiseFolderName(name)
    if (!sanitised) {
      throw new Error("Project name cannot be empty after sanitisation")
    }
    const project: Project = {
      id: generateId(),
      name,
      description,
      icon,
      deadline,
      created_at: new Date().toISOString(),
      folder_path: sanitised,
    }
    try {
      await invoke("create_project_folder", { projectName: sanitised })
    } catch (e) {
      console.warn("Could not create project folder on disk:", e)
    }
    const updated = [...projects, project]
    await saveProjects(updated)
    return project
  }, [projects, saveProjects])

  const updateProject = useCallback(async (
    id: string,
    updates: Partial<Omit<Project, "id" | "created_at" | "folder_path">>
  ) => {
    const updated = projects.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    )
    await saveProjects(updated)
  }, [projects, saveProjects])

  const deleteProject = useCallback(async (id: string) => {
    const updated = projects.filter((p) => p.id !== id)
    await saveProjects(updated)
  }, [projects, saveProjects])

  const getProjectById = useCallback((id: string) => {
    return projects.find((p) => p.id === id) || null
  }, [projects])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return {
    projects,
    loading,
    error,
    addProject,
    updateProject,
    deleteProject,
    getProjectById,
    refresh: loadProjects,
  }
}
