import type { CalendarEvent, StudySession, Subject } from "@/lib/types"
import type { NotionCalendarSettings } from "@/lib/settings"
import type { NotionPage, NotionProperty, SyncCtx } from "@/lib/notion/schema"
import {
  getPageKind,
  getFocalId,
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
} from "@/lib/notion/schema"
import { findSubjectIdFromValues } from "@/lib/notion/subjectMatch"

function recordSkippedReason(ctx: SyncCtx, reason: string | undefined): void {
  if (reason && !ctx.skippedReasons.includes(reason) && ctx.skippedReasons.length < 3) {
    ctx.skippedReasons.push(reason)
  }
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
    if (!existingSource?.lastEditedTime || existingSource.lastEditedTime !== page.last_edited_time) {
      const fromPage = toEventFromPage(page, settings, subjects, findSubjectIdFromValues)
      const updates = {
        title: fromPage.title,
        startTime: fromPage.startTime,
        eventType: fromPage.eventType,
        isFinished: fromPage.isFinished,
      }
      const fullUpdates: Record<string, unknown> = { ...updates }
      if (fromPage.endTime !== undefined) fullUpdates.endTime = fromPage.endTime
      if (fromPage.subjectId !== undefined) fullUpdates.subjectId = fromPage.subjectId
      fullUpdates.source = getNotionSource(page, "event", existingSource?.bodyHash)
      ctx.updatedEvents.set(existing.id, {
        ...ctx.updatedEvents.get(existing.id),
        ...fullUpdates,
      })
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
    ctx.updatedEvents.set(match.id, {
      ...ctx.updatedEvents.get(match.id),
      source: getNotionSource(page, "event", hashBody(match.description)),
    })
    return
  }

  if (getFocalId(page) || existingEvents.some((e) => e.source?.type === "notion" && e.source.id === page.id)) {
    return
  }

  ctx.created.push(toEventFromPage(page, settings, subjects, findSubjectIdFromValues))
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
    if (!existing.source?.lastEditedTime || existing.source.lastEditedTime !== page.last_edited_time) {
      const session = toSessionFromPage(page, settings, subjects, findSubjectIdFromValues)
      if (session) {
        ctx.updatedSessions.set(existing.id, {
          ...ctx.updatedSessions.get(existing.id),
          title: session.title,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status,
          subjectIds: session.subjectIds,
          completedAt: session.completedAt,
          source: getNotionSource(page, "session", existing.source?.bodyHash),
        })
      }
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
    const bodyText = [match.description, match.notes].filter(Boolean).join("\n\n") || undefined
    ctx.updatedSessions.set(match.id, {
      ...ctx.updatedSessions.get(match.id),
      source: getNotionSource(page, "session", hashBody(bodyText)),
    })
    return
  }

  if (getFocalId(page) || existingSessions.some((s) => s.source?.type === "notion" && s.source.id === page.id)) {
    return
  }

  const session = toSessionFromPage(page, settings, subjects, findSubjectIdFromValues)
  if (session) ctx.createdSessions.push(session)
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
    const kind = getPageKind(properties, settings)
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
