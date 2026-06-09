import { useState, useEffect, useCallback, useRef } from "react"
import { appDataDir } from "@tauri-apps/api/path"
import { readTextFile, writeTextFile, mkdir, exists } from "@tauri-apps/plugin-fs"
import type { ConfidenceScore, StudySession } from "@/lib/types"

function isConfidenceScore(value: unknown): value is ConfidenceScore {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
}

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
    confidence: isConfidenceScore(obj.confidence) ? obj.confidence : undefined,
    blockers: typeof obj.blockers === "string" ? obj.blockers : undefined,
    nextAction: typeof obj.nextAction === "string" ? obj.nextAction : undefined,
    completedAt: typeof obj.completedAt === "string" ? obj.completedAt : undefined,
    source: typeof obj.source === "object" && obj.source !== null && (obj.source as Record<string, unknown>).type === "notion" && typeof (obj.source as Record<string, unknown>).id === "string"
      ? {
        type: "notion",
        id: String((obj.source as Record<string, unknown>).id),
        url: typeof (obj.source as Record<string, unknown>).url === "string" ? String((obj.source as Record<string, unknown>).url) : undefined,
        lastEditedTime: typeof (obj.source as Record<string, unknown>).lastEditedTime === "string" ? String((obj.source as Record<string, unknown>).lastEditedTime) : undefined,
        kind: (obj.source as Record<string, unknown>).kind === "event" || (obj.source as Record<string, unknown>).kind === "session"
          ? (obj.source as Record<string, unknown>).kind as "event" | "session"
          : undefined,
      }
      : undefined,
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

  // Ref always holds the latest sessions so mutation callbacks never operate on stale closures.
  const sessionsRef = useRef(sessions)
  useEffect(() => { sessionsRef.current = sessions })

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
    status: StudySession["status"] = "planned",
    activeDurations?: { start: string; end: string }[],
  ) => {
    const session: StudySession = {
      id: generateId(),
      projectId,
      subjectIds,
      title,
      description,
      startTime,
      endTime,
      activeDurations,
      status,
      topics,
      notes,
      created_at: new Date().toISOString(),
    }
    const updated = [...sessionsRef.current, session]
    await saveSessions(updated)
    return session
  }, [saveSessions])

  const addSessions = useCallback(async (items: {
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
  }[]) => {
    const createdAt = new Date().toISOString()
    const newSessions: StudySession[] = items.map((item) => ({
      id: generateId(),
      projectId: item.projectId,
      subjectIds: item.subjectIds,
      title: item.title,
      description: item.description,
      startTime: item.startTime,
      endTime: item.endTime,
      status: "planned",
      topics: item.topics,
      notes: item.notes,
      created_at: createdAt,
    }))
    const updated = [...sessionsRef.current, ...newSessions]
    await saveSessions(updated)
    return newSessions
  }, [saveSessions])

  const updateSession = useCallback(async (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => {
    const updated = sessionsRef.current.map((s) =>
      s.id === id ? { ...s, ...updates } : s
    )
    await saveSessions(updated)
  }, [saveSessions])

  const updateSessions = useCallback(async (
    items: { id: string; updates: Partial<Omit<StudySession, "id" | "created_at">> }[]
  ) => {
    if (items.length === 0) return
    const updateMap = new Map(items.map((item) => [item.id, item.updates]))
    const updated = sessionsRef.current.map((session) => {
      const updates = updateMap.get(session.id)
      return updates ? { ...session, ...updates } : session
    })
    await saveSessions(updated)
  }, [saveSessions])

  const deleteSession = useCallback(async (id: string) => {
    const updated = sessionsRef.current.filter((s) => s.id !== id)
    await saveSessions(updated)
  }, [saveSessions])

  const restoreSession = useCallback(async (session: StudySession) => {
    const exists = sessionsRef.current.some((s) => s.id === session.id)
    if (exists) return
    const updated = [...sessionsRef.current, session]
    await saveSessions(updated)
  }, [saveSessions])

  const deleteSessions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const updated = sessionsRef.current.filter((session) => !idSet.has(session.id))
    await saveSessions(updated)
  }, [saveSessions])

  const restoreSessions = useCallback(async (sessionsToRestore: StudySession[]) => {
    const existingIds = new Set(sessionsRef.current.map((s) => s.id))
    const newSessions = sessionsToRestore.filter((s) => !existingIds.has(s.id))
    if (newSessions.length === 0) return
    const updated = [...sessionsRef.current, ...newSessions]
    await saveSessions(updated)
  }, [saveSessions])

  const updateAndDeleteSessions = useCallback(async (
    items: { id: string; updates: Partial<Omit<StudySession, "id" | "created_at">> }[],
    ids: string[],
  ) => {
    if (items.length === 0 && ids.length === 0) return
    const updateMap = new Map(items.map((item) => [item.id, item.updates]))
    const deleteSet = new Set(ids)
    const updated = sessionsRef.current
      .filter((session) => !deleteSet.has(session.id))
      .map((session) => {
        const updates = updateMap.get(session.id)
        return updates ? { ...session, ...updates } : session
      })
    await saveSessions(updated)
  }, [saveSessions])

  const syncSessions = useCallback(async (
    itemsToCreate: Omit<StudySession, "id" | "created_at">[],
    itemsToUpdate: { id: string; updates: Partial<Omit<StudySession, "id" | "created_at">> }[],
  ) => {
    const updateMap = new Map(itemsToUpdate.map((item) => [item.id, item.updates]))
    const createdAt = new Date().toISOString()
    const newSessions: StudySession[] = itemsToCreate.map((item) => ({
      id: generateId(),
      projectId: item.projectId,
      subjectIds: item.subjectIds,
      title: item.title,
      description: item.description,
      startTime: item.startTime,
      endTime: item.endTime,
      status: item.status,
      topics: item.topics,
      notes: item.notes,
      confidence: item.confidence,
      blockers: item.blockers,
      nextAction: item.nextAction,
      completedAt: item.completedAt,
      source: item.source,
      created_at: createdAt,
    }))
    const updated = sessionsRef.current.map((session) => {
      const updates = updateMap.get(session.id)
      return updates ? { ...session, ...updates } : session
    })
    await saveSessions([...updated, ...newSessions])
    return newSessions
  }, [saveSessions])

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
    addSessions,
    updateSession,
    updateSessions,
    deleteSession,
    deleteSessions,
    restoreSession,
    restoreSessions,
    updateAndDeleteSessions,
    syncSessions,
    getSessionsByProject,
    getUpcomingSessions,
    refresh: loadSessions,
  }
}
