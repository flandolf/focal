import { useState, useEffect, useCallback } from "react"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"
import type { GradeEntry, GradeType } from "@/lib/types"

function normaliseGrade(raw: unknown): GradeEntry {
  const obj = raw as Record<string, unknown>
  return {
    id: typeof obj.id === "string" ? obj.id : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    projectId: typeof obj.projectId === "string" ? obj.projectId : "",
    title: typeof obj.title === "string" ? obj.title : "Untitled",
    score: typeof obj.score === "number" ? obj.score : 0,
    maxScore: typeof obj.maxScore === "number" ? obj.maxScore : 100,
    weight: typeof obj.weight === "number" ? obj.weight : 0,
    type: (obj.type === "sac" || obj.type === "exam" || obj.type === "assignment" || obj.type === "practice") ? obj.type : "sac",
    date: typeof obj.date === "string" ? obj.date : undefined,
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
    created_at: typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
  }
}

function getGradesFilePath(baseDir: string) {
  return `${baseDir}/grades.json`
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useGrades() {
  const [grades, setGrades] = useState<GradeEntry[]>([])
  const [loading, setLoading] = useState(true)

  const loadGrades = useCallback(async () => {
    try {
      const baseDir = await appDataDir()
      const filePath = getGradesFilePath(baseDir)
      if (await exists(filePath)) {
        const content = await readTextFile(filePath)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = JSON.parse(content)
        setGrades(Array.isArray(raw) ? raw.map(normaliseGrade) : [])
      }
    } catch (e) {
      console.error("Failed to load grades:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveGrades = useCallback(async (updated: GradeEntry[]) => {
    const baseDir = await appDataDir()
    const dirExists = await exists(baseDir)
    if (!dirExists) await mkdir(baseDir, { recursive: true })
    await writeTextFile(getGradesFilePath(baseDir), JSON.stringify(updated, null, 2))
    setGrades(updated)
  }, [])

  const addGrade = useCallback(async (
    projectId: string,
    title: string,
    score: number,
    maxScore: number,
    weight: number,
    type: GradeType,
    date?: string,
    notes?: string,
  ) => {
    const entry: GradeEntry = {
      id: generateId(),
      projectId,
      title,
      score,
      maxScore,
      weight,
      type,
      date,
      notes,
      created_at: new Date().toISOString(),
    }
    await saveGrades([...grades, entry])
    return entry
  }, [grades, saveGrades])

  const updateGrade = useCallback(async (id: string, updates: Partial<Omit<GradeEntry, "id" | "projectId" | "created_at">>) => {
    const updated = grades.map((g) => g.id === id ? { ...g, ...updates } : g)
    await saveGrades(updated)
  }, [grades, saveGrades])

  const deleteGrade = useCallback(async (id: string) => {
    await saveGrades(grades.filter((g) => g.id !== id))
  }, [grades, saveGrades])

  const getGradesByProject = useCallback((projectId: string) => {
    return grades.filter((g) => g.projectId === projectId)
  }, [grades])

  const getWeightedScore = useCallback((projectId: string, type?: GradeType): number => {
    const projectGrades = grades.filter((g) => g.projectId === projectId && (!type || g.type === type))
    if (projectGrades.length === 0) return 0
    const totalWeight = projectGrades.reduce((sum, g) => sum + g.weight, 0)
    if (totalWeight === 0) return 0
    const weighted = projectGrades.reduce((sum, g) => sum + (g.score / g.maxScore) * g.weight, 0)
    return Math.round(weighted / totalWeight * 100 * 10) / 10
  }, [grades])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, @typescript-eslint/no-floating-promises
    loadGrades()
  }, [loadGrades])

  return {
    grades,
    loading,
    addGrade,
    updateGrade,
    deleteGrade,
    getGradesByProject,
    getWeightedScore,
    refresh: loadGrades,
  }
}
