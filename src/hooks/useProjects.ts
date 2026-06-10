import { useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import type { Project, DeadlineType, Unit } from "@/lib/types"
import { sanitiseFolderName, generateId } from "@/lib/utils"
import { DEFAULT_SUBFOLDERS } from "@/lib/types"
import { usePersistedData } from "@/lib/hooks/usePersistedData"
import { useLatestRef } from "@/lib/hooks/useLatestRef"

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
    deadlineType: (obj.deadlineType === "sac" || obj.deadlineType === "exam" || obj.deadlineType === "assignment") ? obj.deadlineType : undefined,
    examDate: typeof obj.examDate === "string" ? obj.examDate : undefined,
    isFavorite: typeof obj.isFavorite === "boolean" ? obj.isFavorite : false,
    isArchived: typeof obj.isArchived === "boolean" ? obj.isArchived : false,
    isFinished: typeof obj.isFinished === "boolean" ? obj.isFinished : false,
    customSubfolders: Array.isArray(obj.customSubfolders) ? obj.customSubfolders.filter((s): s is string => typeof s === "string") : undefined,
  }
}

export function useProjects() {
  const { data: projects, loading, error, save: saveProjects, refresh } = usePersistedData({
    fileName: "projects.json",
    normalize: normaliseProject,
    onLoad: (projects) => [...projects].reverse(),
  })

  const projectsRef = useLatestRef(projects)

  const addProject = useCallback(async (name: string, description?: string, icon?: string, deadline?: string, subjectId?: string, unit?: Unit, deadlineType?: DeadlineType, examDate?: string, customSubfolders?: string[]) => {
    const sanitised = sanitiseFolderName(name)
    if (!sanitised) {
      throw new Error("Project name cannot be empty after sanitisation")
    }

    let subfolders = DEFAULT_SUBFOLDERS
    if (subjectId) {
      try {
        const templateFolders = await invoke<string[]>("get_subject_folder_template", { subjectId })
        subfolders = templateFolders
      } catch (e) {
        console.warn("Could not get subject folder template, using defaults:", e)
      }
    }

    const allSubfolders = customSubfolders ? [...subfolders, ...customSubfolders] : subfolders

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
      examDate,
      customSubfolders,
    }
    try {
      await invoke("create_project_with_subfolders", {
        projectName: sanitised,
        subfolders: allSubfolders,
      })
    } catch (e) {
      console.warn("Could not create project folder on disk:", e)
    }
    const updated = [...projectsRef.current, project]
    await saveProjects(updated)
    return project
  }, [projectsRef, saveProjects])

  const updateProject = useCallback(async (
    id: string,
    updates: Partial<Omit<Project, "id" | "created_at" | "folder_path">>
  ) => {
    const updated = projectsRef.current.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    )
    await saveProjects(updated)
  }, [projectsRef, saveProjects])

  const deleteProject = useCallback(async (id: string) => {
    const updated = projectsRef.current.filter((p) => p.id !== id)
    await saveProjects(updated)
  }, [projectsRef, saveProjects])

  const restoreProject = useCallback(async (project: Project) => {
    const exists = projectsRef.current.some((p) => p.id === project.id)
    if (exists) return
    const updated = [...projectsRef.current, project]
    await saveProjects(updated)
  }, [projectsRef, saveProjects])

  const addCustomSubfolder = useCallback(async (id: string, folderName: string) => {
    const sanitised = sanitiseFolderName(folderName)
    if (!sanitised) {
      throw new Error("Folder name cannot be empty after sanitisation")
    }

    const project = projectsRef.current.find((p) => p.id === id)
    if (!project) {
      throw new Error("Project not found")
    }

    const existingFolders = [...DEFAULT_SUBFOLDERS, ...(project.customSubfolders ?? [])]
    if (existingFolders.includes(sanitised)) {
      throw new Error("Folder already exists")
    }

    try {
      await invoke("create_project_with_subfolders", {
        projectName: project.folder_path,
        subfolders: [sanitised],
      })
    } catch (e) {
      console.warn("Could not create folder on disk:", e)
    }

    const updated = projectsRef.current.map((p) =>
      p.id === id
        ? { ...p, customSubfolders: [...(p.customSubfolders ?? []), sanitised] }
        : p
    )
    await saveProjects(updated)
  }, [projectsRef, saveProjects])

  const removeCustomSubfolder = useCallback(async (id: string, folderName: string) => {
    const project = projectsRef.current.find((p) => p.id === id)
    if (!project) {
      throw new Error("Project not found")
    }

    const currentSubfolders = project.customSubfolders ?? []
    if (!currentSubfolders.includes(folderName)) {
      throw new Error("Folder not found in custom subfolders")
    }

    const updated = projectsRef.current.map((p) =>
      p.id === id
        ? { ...p, customSubfolders: currentSubfolders.filter((f) => f !== folderName) }
        : p
    )
    await saveProjects(updated)
  }, [projectsRef, saveProjects])

  return {
    projects,
    loading,
    error,
    addProject,
    updateProject,
    deleteProject,
    restoreProject,
    addCustomSubfolder,
    removeCustomSubfolder,
    refresh,
  }
}
