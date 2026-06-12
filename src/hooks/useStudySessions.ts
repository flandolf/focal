import { useCallback } from "react"
import type { ConfidenceScore, StudySession } from "@/lib/types"
import { generateId } from "@/lib/utils"
import { usePersistedData } from "@/lib/hooks/usePersistedData"
import { useLatestRef } from "@/lib/hooks/useLatestRef"
import { recordLocalSoftDelete, recordLocalUpsert } from "@/lib/sync/engine"

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
    activeDurations: Array.isArray(obj.activeDurations)
      ? (obj.activeDurations as { start: string; end: string }[]).filter(
          (d) => typeof d.start === "string" && typeof d.end === "string",
        )
      : undefined,
    created_at: typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
    updated_at: typeof obj.updated_at === "string" ? obj.updated_at : typeof obj.created_at === "string" ? obj.created_at : new Date().toISOString(),
    deleted_at: typeof obj.deleted_at === "string" ? obj.deleted_at : null,
    last_modified_device_id: typeof obj.last_modified_device_id === "string" ? obj.last_modified_device_id : null,
  }
}

export function useStudySessions() {
  const { data: sessions, loading, error, save: saveSessions, refresh } = usePersistedData({
    fileName: "sessions.json",
    normalize: normaliseSession,
    onLoad: (normalised) => normalised.filter((session) => !session.deleted_at),
  })

  const sessionsRef = useLatestRef(sessions)

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
    const now = new Date().toISOString()
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
      created_at: now,
      updated_at: now,
    }
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
    activeDurations?: { start: string; end: string }[]
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
      activeDurations: item.activeDurations,
      created_at: createdAt,
      updated_at: createdAt,
    }))
    const updated = [...sessionsRef.current, ...newSessions]
    await saveSessions(updated)
    newSessions.forEach((session) => void recordLocalUpsert("study_sessions", session))
    return newSessions
  }, [sessionsRef, saveSessions])

  const updateSession = useCallback(async (
    id: string,
    updates: Partial<Omit<StudySession, "id" | "created_at">>
  ) => {
    const updated = sessionsRef.current.map((s) =>
      s.id === id ? { ...s, ...updates, updated_at: new Date().toISOString() } : s
    )
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
      return updates ? { ...session, ...updates, updated_at: new Date().toISOString() } : session
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
    const restored = { ...session, deleted_at: null, updated_at: new Date().toISOString() }
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
    const restoredSessions = newSessions.map((session) => ({ ...session, deleted_at: null, updated_at: new Date().toISOString() }))
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
        return updates ? { ...session, ...updates, updated_at: new Date().toISOString() } : session
      })
    await saveSessions(updated)
    items.forEach((item) => {
      const session = updated.find((candidate) => candidate.id === item.id)
      if (session) void recordLocalUpsert("study_sessions", session)
    })
    ids.forEach((id) => void recordLocalSoftDelete("study_sessions", id))
  }, [sessionsRef, saveSessions])

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
      activeDurations: item.activeDurations,
      source: item.source,
      created_at: createdAt,
      updated_at: createdAt,
    }))
    const updated = sessionsRef.current.map((session) => {
      const updates = updateMap.get(session.id)
      return updates ? { ...session, ...updates, updated_at: createdAt } : session
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
