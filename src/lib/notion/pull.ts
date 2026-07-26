import type { CalendarEvent, NotionSyncSnapshot, StudySession, Subject } from "@/lib/types"
import type { NotionCalendarSettings } from "@/lib/settings"
import type { EventUpdates, NotionPage, NotionProperty, SessionUpdates, SyncCtx } from "@/lib/notion/schema"
import {
  getPageKind,
  getFocalId,
  getFocalKind,
  getPageTitle,
  getPropertyDateForEvent,
  getNotionSource,
  pageMatchesEvent,
  pageMatchesSession,
  toEventFromPage,
  toSessionFromPage,
  eventFingerprint,
  sessionFingerprint,
  hashBody,
  bodyHasChanged,
  buildSessionBodyText,
  eventSyncSnapshot,
  sessionSyncSnapshot,
  notionSnapshotsEqual,
  mergeNotionSyncSnapshots,
  resolveNotionSyncSnapshot,
} from "@/lib/notion/schema"
import { findSubjectIdFromValues } from "@/lib/notion/subjectMatch"

function recordSkippedReason(ctx: SyncCtx, reason: string | undefined): void {
  if (reason && !ctx.skippedReasons.includes(reason) && ctx.skippedReasons.length < 3) {
    ctx.skippedReasons.push(reason)
  }
}

function eventUpdatesFromSnapshot(snapshot: NotionSyncSnapshot): EventUpdates {
  const updates: EventUpdates = {
    title: String(snapshot.title ?? ""),
    startTime: String(snapshot.startTime ?? ""),
    endTime: typeof snapshot.endTime === "string" ? snapshot.endTime : undefined,
  }
  if (typeof snapshot.eventType === "string") updates.eventType = snapshot.eventType as CalendarEvent["eventType"]
  if (typeof snapshot.isFinished === "boolean") updates.isFinished = snapshot.isFinished
  if ("subjectId" in snapshot) updates.subjectId = typeof snapshot.subjectId === "string" ? snapshot.subjectId : undefined
  return updates
}

function sessionUpdatesFromSnapshot(
  snapshot: NotionSyncSnapshot,
  existing: StudySession,
  currentPrimarySubjectId?: string | null,
  remoteCompletedAt?: string,
): SessionUpdates {
  const updates: SessionUpdates = {
    title: String(snapshot.title ?? ""),
    startTime: String(snapshot.startTime ?? ""),
    endTime: String(snapshot.endTime ?? snapshot.startTime ?? ""),
  }
  if ("subjectId" in snapshot) {
    const nextPrimarySubjectId = typeof snapshot.subjectId === "string" ? snapshot.subjectId : null
    if (nextPrimarySubjectId !== currentPrimarySubjectId) {
      updates.subjectIds = [
        ...(nextPrimarySubjectId ? [nextPrimarySubjectId] : []),
        ...existing.subjectIds.filter((subjectId) => (
          subjectId !== currentPrimarySubjectId && subjectId !== nextPrimarySubjectId
        )),
      ]
    }
  }
  if (typeof snapshot.isCompleted === "boolean") {
    const currentlyCompleted = existing.status === "completed" || Boolean(existing.completedAt)
    if (snapshot.isCompleted !== currentlyCompleted) {
      updates.status = snapshot.isCompleted
        ? "completed"
        : existing.execution.intervals.length > 0
          ? "in-progress"
          : "planned"
      updates.completedAt = snapshot.isCompleted
        ? (remoteCompletedAt ?? existing.completedAt ?? new Date().toISOString())
        : undefined
    }
  }
  return updates
}

function pullEvent(
  page: NotionPage,
  title: string,
  startTime: string,
  endTime: string | undefined,
  properties: Record<string, NotionProperty>,
  existingEvents: CalendarEvent[],
  eventBySourceId: Map<string, CalendarEvent>,
  settings: NotionCalendarSettings,
  subjects: Subject[],
  ctx: SyncCtx,
): void {
  const existing = eventBySourceId.get(page.id)
    ?? (getFocalId(page) ? existingEvents.find((event) => event.id === getFocalId(page)) : undefined)
  if (existing) {
    ctx.matchedEventIds.add(existing.id)
    const existingSource = existing.source?.type === "notion" ? existing.source : undefined
    if (
      !existing.source
      && getFocalId(page) === existing.id
      && pageMatchesEvent(page, existing, settings, subjects, findSubjectIdFromValues)
    ) {
      const bodyHash = hashBody(existing.description)
      ctx.updatedEvents.set(existing.id, {
        ...ctx.updatedEvents.get(existing.id),
        source: getNotionSource(
          page,
          "event",
          undefined,
          eventSyncSnapshot(existing, settings),
        ),
      })
      if (bodyHash === undefined) {
        ctx.pulledEventIds.add(existing.id)
        ctx.acknowledgedEventIds.add(existing.id)
      }
      return
    }
    if (!existingSource?.lastEditedTime || existingSource.lastEditedTime !== page.last_edited_time) {
      const fromPage = toEventFromPage(page, settings, subjects, findSubjectIdFromValues)
      const localSnapshot = eventSyncSnapshot(existing, settings)
      const remoteSnapshot = eventSyncSnapshot(fromPage, settings)
      const remoteSource = getNotionSource(page, "event", existingSource?.bodyHash, remoteSnapshot)
      const remoteUpdates: EventUpdates = {
        ...eventUpdatesFromSnapshot(remoteSnapshot),
        source: remoteSource,
      }
      if (ctx.dirtyEventIds.has(existing.id)) {
        const localBodyChanged = bodyHasChanged(existingSource?.bodyHash, existing.description)
        const merge = existingSource?.syncSnapshot
          ? mergeNotionSyncSnapshots(existingSource.syncSnapshot, localSnapshot, remoteSnapshot)
          : undefined
        if (merge) {
          if (merge.conflictingFields.length === 0) {
            ctx.updatedEvents.set(existing.id, {
              ...ctx.updatedEvents.get(existing.id),
              ...eventUpdatesFromSnapshot(merge.merged),
              source: remoteSource,
            })
            if (!localBodyChanged && notionSnapshotsEqual(merge.merged, remoteSnapshot)) {
              ctx.pulledEventIds.add(existing.id)
              ctx.acknowledgedEventIds.add(existing.id)
            }
            return
          }
        } else if (notionSnapshotsEqual(localSnapshot, remoteSnapshot)) {
          ctx.updatedEvents.set(existing.id, {
            ...ctx.updatedEvents.get(existing.id),
            source: remoteSource,
          })
          if (!localBodyChanged) {
            ctx.pulledEventIds.add(existing.id)
            ctx.acknowledgedEventIds.add(existing.id)
          }
          return
        }

        const conflictingFields = merge?.conflictingFields ?? ["record"]
        const localResolutionSnapshot = resolveNotionSyncSnapshot(
          merge?.merged ?? {},
          localSnapshot,
          conflictingFields,
        )
        const remoteResolutionSnapshot = resolveNotionSyncSnapshot(
          merge?.merged ?? {},
          remoteSnapshot,
          conflictingFields,
        )
        ctx.conflicts += 1
        ctx.conflictedEventIds.add(existing.id)
        ctx.conflictDetails.push(`Event "${existing.title}" was modified both locally and in Notion`)
        ctx.conflictItems.push({
          localId: existing.id,
          kind: "event",
          title: existing.title,
          startTime: existing.startTime,
          endTime: existing.endTime,
          notionPageId: page.id,
          notionLastEditedTime: page.last_edited_time,
          notionUrl: page.url,
          localUpdates: eventUpdatesFromSnapshot(localResolutionSnapshot),
          remoteUpdates: eventUpdatesFromSnapshot(remoteResolutionSnapshot),
          localSnapshot,
          remoteSnapshot,
          conflictingFields,
          localUpdatedAt: existing.updated_at,
          localBodyHash: hashBody(existing.description),
        })
        return
      }
      ctx.updatedEvents.set(existing.id, {
        ...ctx.updatedEvents.get(existing.id),
        ...remoteUpdates,
      })
      ctx.pulledEventIds.add(existing.id)
      ctx.acknowledgedEventIds.add(existing.id)
    } else if (
      !existingSource.syncSnapshot
      && !bodyHasChanged(existingSource.bodyHash, existing.description)
      && pageMatchesEvent(page, existing, settings, subjects, findSubjectIdFromValues)
    ) {
      ctx.updatedEvents.set(existing.id, {
        ...ctx.updatedEvents.get(existing.id),
        source: getNotionSource(page, "event", existingSource.bodyHash, eventSyncSnapshot(existing, settings)),
      })
      ctx.pulledEventIds.add(existing.id)
      ctx.acknowledgedEventIds.add(existing.id)
    }
    return
  }

  const candidates = existingEvents.filter((e) => (
    !e.source && !ctx.matchedEventIds.has(e.id) && pageMatchesEvent(page, e, settings, subjects, findSubjectIdFromValues)
  ))
  if (candidates.length > 1) {
    const pageStart = new Date(startTime).getTime()
    candidates.sort((a, b) =>
      Math.abs(new Date(a.startTime).getTime() - pageStart) -
      Math.abs(new Date(b.startTime).getTime() - pageStart),
    )
  }
  for (const c of candidates) ctx.blockedEventFingerprints.add(eventFingerprint(c))

  const match = candidates[0]
  if (match) {
    ctx.matchedEventIds.add(match.id)
    const bodyHash = hashBody(match.description)
    ctx.updatedEvents.set(match.id, {
      ...ctx.updatedEvents.get(match.id),
      source: getNotionSource(
        page,
        "event",
        undefined,
        eventSyncSnapshot(match, settings),
      ),
    })
    if (bodyHash === undefined) {
      ctx.pulledEventIds.add(match.id)
      ctx.acknowledgedEventIds.add(match.id)
    }
    return
  }

  const focalId = getFocalId(page)
  const fromPage = toEventFromPage(page, settings, subjects, findSubjectIdFromValues)
  ctx.created.push(focalId ? { ...fromPage, id: focalId } : fromPage)
}

function pullSession(
  page: NotionPage,
  title: string,
  startTime: string,
  endTime: string | undefined,
  properties: Record<string, NotionProperty>,
  existingSessions: StudySession[],
  sessionBySourceId: Map<string, StudySession>,
  settings: NotionCalendarSettings,
  subjects: Subject[],
  ctx: SyncCtx,
): void {
  const existing = sessionBySourceId.get(page.id)
    ?? (getFocalId(page) ? existingSessions.find((session) => session.id === getFocalId(page)) : undefined)
  if (existing) {
    ctx.matchedSessionIds.add(existing.id)
    if (
      !existing.source
      && getFocalId(page) === existing.id
      && pageMatchesSession(page, existing, settings, subjects, findSubjectIdFromValues)
    ) {
      const bodyText = buildSessionBodyText(existing)
      ctx.updatedSessions.set(existing.id, {
        ...ctx.updatedSessions.get(existing.id),
        source: getNotionSource(
          page,
          "session",
          undefined,
          sessionSyncSnapshot(existing, settings, subjects),
        ),
      })
      if (hashBody(bodyText) === undefined) {
        ctx.pulledSessionIds.add(existing.id)
        ctx.acknowledgedSessionIds.add(existing.id)
      }
      return
    }
    if (!existing.source?.lastEditedTime || existing.source.lastEditedTime !== page.last_edited_time) {
      const session = toSessionFromPage(page, settings, subjects, findSubjectIdFromValues)
      if (session) {
        const localSnapshot = sessionSyncSnapshot(existing, settings, subjects)
        const remoteSnapshot = sessionSyncSnapshot(session, settings, subjects)
        const currentPrimarySubjectId = typeof localSnapshot.subjectId === "string" ? localSnapshot.subjectId : null
        const remoteSource = getNotionSource(page, "session", existing.source?.bodyHash, remoteSnapshot)
        const remoteUpdates: SessionUpdates = {
          ...ctx.updatedSessions.get(existing.id),
          ...sessionUpdatesFromSnapshot(remoteSnapshot, existing, currentPrimarySubjectId, session.completedAt),
          source: remoteSource,
        }
        if (ctx.dirtySessionIds.has(existing.id)) {
          const localBodyChanged = bodyHasChanged(existing.source?.bodyHash, buildSessionBodyText(existing))
          const merge = existing.source?.syncSnapshot
            ? mergeNotionSyncSnapshots(existing.source.syncSnapshot, localSnapshot, remoteSnapshot)
            : undefined
          if (merge) {
            if (merge.conflictingFields.length === 0) {
              ctx.updatedSessions.set(existing.id, {
                ...ctx.updatedSessions.get(existing.id),
                ...sessionUpdatesFromSnapshot(merge.merged, existing, currentPrimarySubjectId, session.completedAt),
                source: remoteSource,
              })
              if (!localBodyChanged && notionSnapshotsEqual(merge.merged, remoteSnapshot)) {
                ctx.pulledSessionIds.add(existing.id)
                ctx.acknowledgedSessionIds.add(existing.id)
              }
              return
            }
          } else if (notionSnapshotsEqual(localSnapshot, remoteSnapshot)) {
            ctx.updatedSessions.set(existing.id, {
              ...ctx.updatedSessions.get(existing.id),
              source: remoteSource,
            })
            if (!localBodyChanged) {
              ctx.pulledSessionIds.add(existing.id)
              ctx.acknowledgedSessionIds.add(existing.id)
            }
            return
          }

          const conflictingFields = merge?.conflictingFields ?? ["record"]
          const localResolutionSnapshot = resolveNotionSyncSnapshot(
            merge?.merged ?? {},
            localSnapshot,
            conflictingFields,
          )
          const remoteResolutionSnapshot = resolveNotionSyncSnapshot(
            merge?.merged ?? {},
            remoteSnapshot,
            conflictingFields,
          )
          ctx.conflicts += 1
          ctx.conflictedSessionIds.add(existing.id)
          ctx.conflictDetails.push(`Session "${existing.title}" was modified both locally and in Notion`)
          ctx.conflictItems.push({
            localId: existing.id,
            kind: "session",
            title: existing.title,
            startTime: existing.startTime,
            endTime: existing.endTime,
            notionPageId: page.id,
            notionLastEditedTime: page.last_edited_time,
            notionUrl: page.url,
            localUpdates: sessionUpdatesFromSnapshot(
              localResolutionSnapshot,
              existing,
              currentPrimarySubjectId,
              session.completedAt,
            ),
            remoteUpdates: sessionUpdatesFromSnapshot(
              remoteResolutionSnapshot,
              existing,
              currentPrimarySubjectId,
              session.completedAt,
            ),
            localSnapshot,
            remoteSnapshot,
            conflictingFields,
            localUpdatedAt: existing.updated_at,
            localBodyHash: hashBody(buildSessionBodyText(existing)),
            localSubjectIds: [...existing.subjectIds],
          })
          return
        }
        ctx.updatedSessions.set(existing.id, remoteUpdates)
        ctx.pulledSessionIds.add(existing.id)
        ctx.acknowledgedSessionIds.add(existing.id)
      }
    } else if (
      !existing.source.syncSnapshot
      && !bodyHasChanged(existing.source.bodyHash, buildSessionBodyText(existing))
      && pageMatchesSession(page, existing, settings, subjects, findSubjectIdFromValues)
    ) {
      ctx.updatedSessions.set(existing.id, {
        ...ctx.updatedSessions.get(existing.id),
        source: getNotionSource(
          page,
          "session",
          existing.source.bodyHash,
          sessionSyncSnapshot(existing, settings, subjects),
        ),
      })
      ctx.pulledSessionIds.add(existing.id)
      ctx.acknowledgedSessionIds.add(existing.id)
    }
    return
  }

  const candidates = existingSessions.filter((s) => (
    !s.source && !ctx.matchedSessionIds.has(s.id) && pageMatchesSession(page, s, settings, subjects, findSubjectIdFromValues)
  ))
  if (candidates.length > 1) {
    const pageStart = new Date(startTime).getTime()
    candidates.sort((a, b) =>
      Math.abs(new Date(a.startTime).getTime() - pageStart) -
      Math.abs(new Date(b.startTime).getTime() - pageStart),
    )
  }
  for (const c of candidates) ctx.blockedSessionFingerprints.add(sessionFingerprint(c))

  const match = candidates[0]
  if (match) {
    ctx.matchedSessionIds.add(match.id)
    const bodyText = buildSessionBodyText(match)
    ctx.updatedSessions.set(match.id, {
      ...ctx.updatedSessions.get(match.id),
      source: getNotionSource(
        page,
        "session",
        undefined,
        sessionSyncSnapshot(match, settings, subjects),
      ),
    })
    if (hashBody(bodyText) === undefined) {
      ctx.pulledSessionIds.add(match.id)
      ctx.acknowledgedSessionIds.add(match.id)
    }
    return
  }

  const session = toSessionFromPage(page, settings, subjects, findSubjectIdFromValues)
  if (session) {
    const focalId = getFocalId(page)
    ctx.createdSessions.push(focalId ? { ...session, id: focalId } : session)
  }
}

export function pullFromNotion(
  pages: NotionPage[],
  existingEvents: CalendarEvent[],
  existingSessions: StudySession[],
  settings: NotionCalendarSettings,
  subjects: Subject[],
  ctx: SyncCtx,
): void {
  const eventBySourceId = new Map<string, CalendarEvent>(
    existingEvents
      .filter((e) => e.source?.type === "notion" && e.source.kind !== "session")
      .map((e) => [e.source!.id, e]),
  )
  const sessionBySourceId = new Map<string, StudySession>(
    existingSessions
      .filter((s) => s.source?.type === "notion" && s.source.kind !== "event")
      .map((s) => [s.source!.id, s]),
  )

  for (const page of pages) {
    const properties = page.properties ?? {}
    const kind = getFocalKind(page) ?? getPageKind(properties, settings)
    const title = getPageTitle(properties, settings.titleProperty)
    const { startTime, endTime, skippedReason } = getPropertyDateForEvent(properties, settings)

    if (!startTime) {
      ctx.skipped += 1
      recordSkippedReason(ctx, skippedReason)
      continue
    }
    recordSkippedReason(ctx, skippedReason)

    if (kind === "session") {
      pullSession(page, title, startTime, endTime, properties, existingSessions, sessionBySourceId, settings, subjects, ctx)
    } else {
      pullEvent(page, title, startTime, endTime, properties, existingEvents, eventBySourceId, settings, subjects, ctx)
    }
  }
}
