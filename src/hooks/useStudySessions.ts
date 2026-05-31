import { useState, useEffect, useCallback } from "react"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"
import type { StudySession } from "@/lib/types"

function normaliseSession(raw: unknown): StudySession {
  const obj = raw as Record<string, unknown>
  return {
    id: typeof obj.id === "string" ? obj.id : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    projectId: typeof obj.projectId === "string" && obj.projectId.length > 0 ? obj.projectId : undefined,
    subjectIds: Array.isArray(obj.subjectIds) ? obj.subjectIds.filter((id): id is string => typeof id === "string") : [],
    title: typeof obj.title === "string" ? obj.title : "Study Session",
    description: typeof obj.description === "string" ? obj.description : undefined,
    startTime: typeof obj.startTime === "string" ? obj.startTime : new Date().toISOString(),
    endTime: typeof obj.endTime === "string" ? obj.endTime : new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: (obj.status === "planned" || obj.status === "in-progress" || obj.status === "completed") ? obj.status : "planned",
    topics: Array.isArray(obj.topics) ? obj.topics : undefined,
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
    created_at: typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
  }
}

function getSessionsFilePath(baseDir: string) {
  return `${baseDir}/sessions.json`
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

export function useStudySessions() {
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      setError(null)
      const baseDir = await appDataDir()
      const filePath = getSessionsFilePath(baseDir)

      if (await exists(filePath)) {
        const content = await readTextFile(filePath)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = JSON.parse(content)
        const normalised: StudySession[] = Array.isArray(raw) ? raw.map(normaliseSession) : []
        setSessions(normalised)
      }
    } catch (e) {
      const msg = `Failed to load study sessions: ${String(e)}`
      console.error(msg)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const saveSessions = useCallback(async (updatedSessions: StudySession[]) => {
    const baseDir = await appDataDir()
    const dirExists = await exists(baseDir)
    if (!dirExists) {
      await mkdir(baseDir, { recursive: true })
    }
    const filePath = getSessionsFilePath(baseDir)
    await writeTextFile(filePath, JSON.stringify(updatedSessions, null, 2))
    setSessions(updatedSessions)
  }, [])

  const addSession = useCallback(async (
    projectId: string | undefined,
    subjectIds: string[],
    title: string,
    startTime: string,
    endTime: string,
    description?: string,
    topics?: string[],
    notes?: string,
  ) => {
    const session: StudySession = {
      id: generateId(),
      projectId,
      subjectIds,
      title,
      description,
      startTime,
      endTime,
      status: "planned",
      topics,
      notes,
      created_at: new Date().toISOString(),
    }
    const updated = [...sessions, session]
    await saveSessions(updated)
    return session
  }, [sessions, saveSessions])

  const updateSession = useCallback(async (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => {
    const updated = sessions.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    )
    await saveSessions(updated)
  }, [sessions, saveSessions])

  const deleteSession = useCallback(async (id: string) => {
    const updated = sessions.filter((s) => s.id !== id)
    await saveSessions(updated)
  }, [sessions, saveSessions])

  const getSessionsByProject = useCallback((projectId: string) => {
    return sessions.filter((s) => s.projectId === projectId)
  }, [sessions])

  const getUpcomingSessions = useCallback((days = 7) => {
    const now = new Date()
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
    return sessions
      .filter((s) => {
        const startTime = new Date(s.startTime)
        return startTime >= now && startTime <= futureDate && s.status === "planned"
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [sessions])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect, @typescript-eslint/no-floating-promises
    loadSessions()
  }, [loadSessions])

  return {
    sessions,
    loading,
    error,
    addSession,
    updateSession,
    deleteSession,
    getSessionsByProject,
    getUpcomingSessions,
    refresh: loadSessions,
  }
}
