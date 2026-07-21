import { normalizeStudySession } from "@/lib/studySessions"
import { SYNC_TABLES, type RemoteSyncChange, type SyncChange, type SyncTable } from "@/lib/sync/types"
import type { StudySession } from "@/lib/types"

export function isSyncTable(value: unknown): value is SyncTable {
  return typeof value === "string" && (SYNC_TABLES as readonly string[]).includes(value)
}

export function isDue(change: Pick<SyncChange, "nextAttemptAt">, now: string): boolean {
  return !change.nextAttemptAt || change.nextAttemptAt <= now
}

export function retryChange(change: SyncChange, error: string, now: string): SyncChange {
  const retryCount = change.retryCount + 1
  return {
    ...change,
    retryCount,
    lastError: error,
    nextAttemptAt: new Date(new Date(now).getTime() + Math.min(300_000, 5_000 * 2 ** Math.max(0, retryCount - 1))).toISOString(),
  }
}

export function latestChanges(changes: RemoteSyncChange[]): RemoteSyncChange[] {
  const latest = new Map<string, RemoteSyncChange>()
  for (const change of changes) {
    const key = `${change.entity}:${change.row_id}`
    if ((latest.get(key)?.revision ?? 0) < change.revision) latest.set(key, change)
  }
  return [...latest.values()].sort((a, b) => a.revision - b.revision)
}

export function repairDuplicateSessions(raw: unknown[]): {
  sessions: StudySession[]
  duplicateIds: string[]
  duplicateNotionPageIds: string[]
} {
  const sessions = raw.map(normalizeStudySession).filter((session) => !session.deleted_at)
  const canonical = new Map<string, StudySession>()
  const duplicateIds: string[] = []
  const duplicateNotionPageIds: string[] = []

  for (const session of sessions) {
    const fingerprint = sessionDuplicateKey(session)
    const existing = canonical.get(fingerprint)
    if (!existing) {
      canonical.set(fingerprint, session)
      continue
    }

    const keepExisting = sessionSortKey(existing) <= sessionSortKey(session)
    const kept = keepExisting ? existing : session
    const duplicate = keepExisting ? session : existing
    canonical.set(fingerprint, mergeDuplicateSessionDetails(kept, duplicate))
    duplicateIds.push(duplicate.id)
    if (duplicate.source?.type === "notion") duplicateNotionPageIds.push(duplicate.source.id)
  }

  const keptById = new Map([...canonical.values()].map((session) => [session.id, session]))
  return {
    sessions: sessions.flatMap((session) => keptById.has(session.id) ? [keptById.get(session.id)!] : []),
    duplicateIds,
    duplicateNotionPageIds,
  }
}

function sessionDuplicateKey(session: StudySession): string {
  return JSON.stringify({
    title: session.title.trim(),
    projectId: session.projectId ?? null,
    subjectIds: [...session.subjectIds].sort(),
    startTime: session.startTime,
    endTime: session.endTime,
    status: session.status,
  })
}

function mergeDuplicateSessionDetails(kept: StudySession, duplicate: StudySession): StudySession {
  const keptRaw = JSON.parse(JSON.stringify(kept)) as Record<string, unknown>
  const duplicateHasBetterTimeline = executionQuality(duplicate) > executionQuality(kept)
  return normalizeStudySession({
    ...keptRaw,
    description: kept.description ?? duplicate.description,
    topics: [...new Set([...(kept.topics ?? []), ...(duplicate.topics ?? [])])],
    schedule: duplicateHasBetterTimeline ? duplicate.schedule : kept.schedule,
    execution: duplicateHasBetterTimeline ? duplicate.execution : kept.execution,
    reflection: {
      notes: kept.reflection?.notes ?? duplicate.reflection?.notes,
      confidence: kept.reflection?.confidence ?? duplicate.reflection?.confidence,
      blockers: kept.reflection?.blockers ?? duplicate.reflection?.blockers,
      nextAction: kept.reflection?.nextAction ?? duplicate.reflection?.nextAction,
    },
    created_at: kept.created_at <= duplicate.created_at ? kept.created_at : duplicate.created_at,
    updated_at: (kept.updated_at ?? kept.created_at) >= (duplicate.updated_at ?? duplicate.created_at)
      ? kept.updated_at
      : duplicate.updated_at,
  })
}

function executionQuality(session: StudySession): number {
  const detailedIntervals = session.execution.intervals.filter((interval) => interval.source !== "imported").length
  const stateScore = session.execution.state === "completed" ? 2 : session.execution.state === "in-progress" ? 1 : 0
  return detailedIntervals * 100 + session.execution.intervals.length * 10 + stateScore
}

function sessionSortKey(session: StudySession): string {
  const localRank = session.createdVia === "notion" ? "1" : "0"
  return `${localRank}:${session.created_at}:${session.id}`
}
