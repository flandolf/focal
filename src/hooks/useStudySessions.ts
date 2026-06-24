import { useCallback } from "react"
import type { StudySession, StudySessionDraft, StudyTimeRange } from "@/lib/types"
import { generateId } from "@/lib/utils"
import { usePersistedData } from "@/lib/hooks/usePersistedData"
import { useLatestRef } from "@/lib/hooks/useLatestRef"
import { recordLocalSoftDelete, recordLocalUpsert } from "@/lib/sync/engine"
import { createStudySession, normalizeStudySession, updateStudySession, type CreateStudySessionInput } from "@/lib/studySessions"

export function useStudySessions() {
  const { data: sessions, loading, error, save: saveSessions, refresh } = usePersistedData({
    fileName: "sessions.json",
    normalize: normalizeStudySession,
    onLoad: (normalised) => normalised.filter((session) => !session.deleted_at),
  })

  const sessionsRef = useLatestRef(sessions)

  const addSession = useCallback(async (input: CreateStudySessionInput) => {
    const session = createStudySession(generateId(), input)
    const updated = [...sessionsRef.current, session]
    await saveSessions(updated)
    void recordLocalUpsert("study_sessions", session)
    return session
  }, [sessionsRef, saveSessions])

  const addSessions = useCallback(async (items: {
    projectId?: string
    subjectIds: string[]
    title: string
    startTime: string
    endTime: string
    description?: string
    topics?: string[]
    notes?: string
    activeDurations?: StudyTimeRange[]
  }[]) => {
    const createdAt = new Date().toISOString()
    const newSessions = items.map((item) => createStudySession(generateId(), {
      projectId: item.projectId,
      subjectIds: item.subjectIds,
      title: item.title,
      description: item.description,
      topics: item.topics,
      schedule: { blocks: item.activeDurations?.length ? item.activeDurations : [{ start: item.startTime, end: item.endTime }] },
      reflection: item.notes ? { notes: item.notes } : undefined,
      createdVia: "planner",
    }, createdAt))
    const updated = [...sessionsRef.current, ...newSessions]
    await saveSessions(updated)
    newSessions.forEach((session) => void recordLocalUpsert("study_sessions", session))
    return newSessions
  }, [sessionsRef, saveSessions])

  const updateSession = useCallback(async (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => {
    const updated = sessionsRef.current.map((s) => s.id === id ? updateStudySession(s, updates) : s)
    await saveSessions(updated)
    const session = updated.find((item) => item.id === id)
    if (session) void recordLocalUpsert("study_sessions", session)
  }, [sessionsRef, saveSessions])

  const updateSessions = useCallback(async (
    items: { id: string; updates: Partial<Omit<StudySession, "id" | "created_at">> }[]
  ) => {
    if (items.length === 0) return
    const updateMap = new Map(items.map((item) => [item.id, item.updates]))
    const updated = sessionsRef.current.map((session) => {
      const updates = updateMap.get(session.id)
      return updates ? updateStudySession(session, updates) : session
    })
    await saveSessions(updated)
    items.forEach((item) => {
      const session = updated.find((candidate) => candidate.id === item.id)
      if (session) void recordLocalUpsert("study_sessions", session)
    })
  }, [sessionsRef, saveSessions])

  const deleteSession = useCallback(async (id: string) => {
    const updated = sessionsRef.current.filter((s) => s.id !== id)
    await saveSessions(updated)
    void recordLocalSoftDelete("study_sessions", id)
  }, [sessionsRef, saveSessions])

  const restoreSession = useCallback(async (session: StudySession) => {
    const exists = sessionsRef.current.some((s) => s.id === session.id)
    if (exists) return
    const restored = updateStudySession(session, { deleted_at: null })
    const updated = [...sessionsRef.current, restored]
    await saveSessions(updated)
    void recordLocalUpsert("study_sessions", restored)
  }, [sessionsRef, saveSessions])

  const deleteSessions = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    const updated = sessionsRef.current.filter((session) => !idSet.has(session.id))
    await saveSessions(updated)
    ids.forEach((id) => void recordLocalSoftDelete("study_sessions", id))
  }, [sessionsRef, saveSessions])

  const restoreSessions = useCallback(async (sessionsToRestore: StudySession[]) => {
    const existingIds = new Set(sessionsRef.current.map((s) => s.id))
    const newSessions = sessionsToRestore.filter((s) => !existingIds.has(s.id))
    if (newSessions.length === 0) return
    const restoredSessions = newSessions.map((session) => updateStudySession(session, { deleted_at: null }))
    const updated = [...sessionsRef.current, ...restoredSessions]
    await saveSessions(updated)
    restoredSessions.forEach((session) => void recordLocalUpsert("study_sessions", session))
  }, [sessionsRef, saveSessions])

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
        return updates ? updateStudySession(session, updates) : session
      })
    await saveSessions(updated)
    items.forEach((item) => {
      const session = updated.find((candidate) => candidate.id === item.id)
      if (session) void recordLocalUpsert("study_sessions", session)
    })
    ids.forEach((id) => void recordLocalSoftDelete("study_sessions", id))
  }, [sessionsRef, saveSessions])

  const syncSessions = useCallback(async (
    itemsToCreate: StudySessionDraft[],
    itemsToUpdate: { id: string; updates: Partial<Omit<StudySession, "id" | "created_at">> }[],
  ) => {
    const updateMap = new Map(itemsToUpdate.map((item) => [item.id, item.updates]))
    const createdAt = new Date().toISOString()
    const newSessions = itemsToCreate.map((item) => normalizeStudySession({
      ...item,
      id: generateId(),
      created_at: createdAt,
      updated_at: createdAt,
    }))
    const updated = sessionsRef.current.map((session) => {
      const updates = updateMap.get(session.id)
      return updates ? updateStudySession(session, updates, createdAt) : session
    })
    await saveSessions([...updated, ...newSessions])
    itemsToUpdate.forEach((item) => {
      const session = updated.find((candidate) => candidate.id === item.id)
      if (session) void recordLocalUpsert("study_sessions", session)
    })
    newSessions.forEach((session) => void recordLocalUpsert("study_sessions", session))
    return newSessions
  }, [sessionsRef, saveSessions])

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
    refresh,
  }
}
