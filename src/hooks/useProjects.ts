import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"
import type { Project, DeadlineType, Unit } from "@/lib/types"
import { sanitiseFolderName } from "@/lib/utils"
import { DEFAULT_SUBFOLDERS } from "@/lib/types"

function normaliseProject(raw: unknown): Project {
  const obj = raw as Record<string, unknown>
  return {
    id: typeof obj.id === "string" ? obj.id : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: typeof obj.name === "string" ? obj.name : "Untitled",
    description: typeof obj.description === "string" ? obj.description : undefined,
    icon: typeof obj.icon === "string" ? obj.icon : undefined,
    deadline: typeof obj.deadline === "string" ? obj.deadline : undefined,
    created_at: typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
    folder_path: typeof obj.folder_path === "string" ? obj.folder_path : "unknown",
    subjectId: typeof obj.subjectId === "string" ? obj.subjectId : undefined,
    unit: (obj.unit === "1" || obj.unit === "2" || obj.unit === "3" || obj.unit === "4") ? obj.unit : undefined,
    deadlineType: (obj.deadlineType === "sac" || obj.deadlineType === "exam" || obj.deadlineType === "assignment" || obj.deadlineType === "gat") ? obj.deadlineType : undefined,
    gatDate: typeof obj.gatDate === "string" ? obj.gatDate : undefined,
    examDate: typeof obj.examDate === "string" ? obj.examDate : undefined,
  }
}

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
        const raw = JSON.parse(content)
        const normalised: Project[] = Array.isArray(raw) ? raw.map(normaliseProject) : []
        setProjects(normalised)
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

  const addProject = useCallback(async (name: string, description?: string, icon?: string, deadline?: string, subjectId?: string, unit?: Unit, deadlineType?: DeadlineType) => {
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
      subjectId,
      unit,
      deadlineType,
    }
    try {
      await invoke("create_project_with_subfolders", { 
        projectName: sanitised,
        subfolders: DEFAULT_SUBFOLDERS,
      })
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
